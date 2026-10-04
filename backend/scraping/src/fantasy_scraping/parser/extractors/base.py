"""Shared extraction context and rule application."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

from lxml.html import HtmlElement

from fantasy_scraping.models.page import ScrapedPage
from fantasy_scraping.parser.dom.document import HtmlDocument
from fantasy_scraping.parser.dom.locators import apply_locator, node_text, read_value
from fantasy_scraping.parser.dom.tables import cell_text, row_nodes
from fantasy_scraping.parser.errors import NormaliseError, ParseError
from fantasy_scraping.parser.models.common import JsonLdPerson, PartialParseWarning
from fantasy_scraping.parser.normalise.registry import REGISTRY
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text
from fantasy_scraping.parser.rules.schema import ExtractRule, RuleSet, TableSpec
from fantasy_scraping.parser.settings import ParserSettings

SECTION_ORDER: dict[str, int] = {
    "meta": 0,
    "identity": 1,
    "status": 2,
    "personal": 3,
    "position": 4,
    "injuries": 5,
    "news": 6,
    "matches.recent": 7,
    "matches.upcoming": 8,
    "market": 9,
    "season_stats": 10,
    "fantasy_points": 11,
    "fixtures": 12,
    "consistency": 13,
}


@dataclass
class ExtractionContext:
    """State for one page. Extractors append warnings; they do not sort them."""

    page: ScrapedPage
    document: HtmlDocument
    rules: RuleSet
    settings: ParserSettings
    json_ld: JsonLdPerson | None
    warnings: list[PartialParseWarning] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    matched: dict[str, str] = field(default_factory=dict)

    def selector(self, name: str) -> str:
        """Return a CSS selector stored on the rule set."""
        raw = str(getattr(self.rules.selectors, name))
        return raw.removeprefix("css:")

    def warn(
        self,
        *,
        code: str,
        section: str,
        path: str,
        rule_id: str,
        message: str,
        severity: str = "warning",
        preview: str | None = None,
        index: int = 0,
    ) -> None:
        """Record a warning. Preview is cleaned and capped at 40 characters."""
        shown = clean_text(preview)[:40] if preview else None
        self.warnings.append(
            PartialParseWarning(
                code=code,
                section=section,
                path=path,
                rule_id=rule_id,
                message=message,
                severity=severity,  # type: ignore[arg-type]
                preview=shown or None,
                index=index,
            )
        )

    def miss(self, path: str) -> None:
        """Remember a dotted path the page did not publish."""
        if path not in self.missing:
            self.missing.append(path)

    def table(self, table_id: str) -> TableSpec:
        """Return a table spec by id."""
        for spec in self.rules.tables:
            if spec.id == table_id:
                return spec
        raise ParseError("input_invalid", "unknown table", section=table_id)


def sort_warnings(warnings: list[PartialParseWarning]) -> list[PartialParseWarning]:
    """Order warnings by section, rule id and index."""
    return sorted(
        warnings,
        key=lambda item: (SECTION_ORDER.get(item.section, 99), item.rule_id, item.index),
    )


def http_url(base: str, href: str | None) -> str | None:
    """Resolve ``href`` against ``base`` and keep only http(s) URLs."""
    if not href:
        return None
    joined = urljoin(base, href.strip())
    parsed = urlparse(joined)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return joined
    return None


def apply_rules(ctx: ExtractionContext, prefix: str) -> dict[str, Any]:
    """Apply scalar rules whose target path starts with ``prefix``.

    Args:
        ctx: Extraction context.
        prefix: Dotted prefix such as ``profile.identity``.

    Returns:
        Values keyed by target path.

    Raises:
        ParseError: A required rule has no value.
    """
    found: dict[str, Any] = {}
    for rule in ctx.rules.rules:
        if rule.target_path != prefix and not rule.target_path.startswith(prefix + "."):
            continue
        raw, used = _read_rule(ctx, rule)
        if raw is None or raw == "":
            ctx.miss(rule.target_path)
            if rule.required == "required":
                raise ParseError("not_a_player_page", "not a player page", section=rule.section)
            if rule.required == "expected":
                ctx.warn(
                    code="field_missing",
                    section=rule.section,
                    path=rule.target_path,
                    rule_id=rule.id,
                    message="expected field missing",
                )
            continue
        try:
            parsed = REGISTRY[rule.normaliser](raw)
        except NormaliseError:
            ctx.miss(rule.target_path)
            ctx.warn(
                code="field_invalid",
                section=rule.section,
                path=rule.target_path,
                rule_id=rule.id,
                message="field could not be parsed",
                preview=raw,
            )
            continue
        ctx.matched[rule.id] = used
        found[rule.target_path] = parsed
    return found


def _read_rule(ctx: ExtractionContext, rule: ExtractRule) -> tuple[str | None, str]:
    locators = [rule.locator, *rule.fallbacks]
    for locator in locators:
        nodes = apply_locator(ctx.document, locator)
        raw = read_value(nodes, rule.read)
        if raw is not None and raw != "":
            return raw, locator
    return None, rule.locator


def column_values(ctx: ExtractionContext, row: HtmlElement, spec: TableSpec) -> dict[str, Any]:
    """Read one row using a table spec. Failed cells become ``None``."""
    values: dict[str, Any] = {}
    for column in spec.columns:
        selector = column.locator.removeprefix("css:")
        nodes = row.cssselect(selector)
        raw = cell_text(row, selector) if nodes or not column.read.startswith("attr:") else ""
        if column.read.startswith("attr:") and nodes:
            raw = nodes[0].get(column.read.removeprefix("attr:")) or ""
        if raw == "":
            values[column.id] = None
            continue
        try:
            values[column.id] = REGISTRY[column.normaliser](raw)
        except NormaliseError:
            values[column.id] = None
    return values


def rows_of(ctx: ExtractionContext, spec: TableSpec) -> list[HtmlElement]:
    """Return capped row nodes for a table spec."""
    selector = spec.row_locator.removeprefix("css:")
    return row_nodes(ctx.document, selector, ctx.settings.max_rows)


def label_pairs(scope: HtmlElement) -> list[tuple[str, str]]:
    """Read definition lists and stat blocks in document order."""
    pairs: list[tuple[str, str]] = []
    for term in scope.cssselect("dt"):
        value = term.getnext()
        if value is not None:
            pairs.append((node_text(term), node_text(value)))
    for node in scope.cssselect(".bigstat, .stat.info"):
        labels = node.cssselect(".label")
        values = node.cssselect(".value")
        if labels and values:
            pairs.append((node_text(labels[0]), node_text(values[0])))
    return pairs


def values_for_group(
    ctx: ExtractionContext,
    pairs: list[tuple[str, str]],
    group: str,
) -> dict[str, Any]:
    """Map Spanish labels in ``group`` onto parsed values."""
    lookup = {casefold_key(label): raw for label, raw in pairs}
    parsed: dict[str, Any] = {}
    for rule in ctx.rules.labels:
        if rule.group != group:
            continue
        raw = lookup.get(casefold_key(rule.label))
        if raw is None or raw == "":
            ctx.miss(rule.path)
            continue
        try:
            parsed[rule.path] = REGISTRY[rule.normaliser](raw)
        except NormaliseError:
            ctx.miss(rule.path)
            ctx.warn(
                code="stat_label_unmapped",
                section="season_stats" if group != "personal" else "personal",
                path=rule.path,
                rule_id=rule.path,
                message="label value could not be parsed",
                preview=raw,
            )
    return parsed


def warn_unknown_labels(ctx: ExtractionContext, pairs: list[tuple[str, str]], section: str) -> None:
    """Warn once per label that no rule maps."""
    known = {casefold_key(item.label) for item in ctx.rules.labels}
    for label, _raw in pairs:
        if casefold_key(label) in known:
            continue
        ctx.warn(
            code="stat_label_unmapped",
            section=section,
            path="season_stats.other",
            rule_id="season_stats.other",
            message="stat label is not mapped",
            preview=label,
        )


def group_present(ctx: ExtractionContext, pairs: list[tuple[str, str]], group: str) -> bool:
    """Return whether any mapped label of ``group`` appears in ``pairs``."""
    present = {casefold_key(label) for label, _raw in pairs}
    return any(
        casefold_key(item.label) in present for item in ctx.rules.labels if item.group == group
    )


def fill_model(model_cls: type[Any], values: dict[str, Any], prefix: str) -> Any:
    """Build ``model_cls`` from dotted paths under ``prefix``."""
    kwargs = {name: values.get(f"{prefix}.{name}") for name in model_cls.model_fields}
    return model_cls(**kwargs)


Normaliser = Callable[[str], Any]
