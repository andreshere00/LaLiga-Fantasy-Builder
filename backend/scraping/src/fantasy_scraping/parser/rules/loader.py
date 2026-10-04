"""Load and validate TOML rule files."""

import functools
import tomllib
from pathlib import Path

from lxml.cssselect import CSSSelector
from lxml.etree import XPath
from pydantic import ValidationError

from fantasy_scraping.parser.normalise.registry import REGISTRY
from fantasy_scraping.parser.rules.schema import (
    CompetitionAlias,
    EventRule,
    ExtractRule,
    LabelRule,
    RuleSet,
    Selectors,
)


def _compile(locator: str) -> None:
    if locator.startswith("css:"):
        CSSSelector(locator.removeprefix("css:"))
        return
    if locator.startswith("xpath:"):
        XPath(locator.removeprefix("xpath:"))
        return
    if locator.startswith("label:") and locator.removeprefix("label:").split("|", 1)[0].strip():
        return
    raise ValueError(f"invalid locator kind: {locator.split(':', 1)[0]}")


def _check_rules(rules: list[ExtractRule]) -> None:
    seen: set[str] = set()
    for rule in rules:
        if rule.id in seen:
            raise ValueError(f"duplicate rule id: {rule.id}")
        seen.add(rule.id)
        if rule.normaliser not in REGISTRY:
            raise ValueError(f"unknown normaliser: {rule.normaliser}")
        _compile(rule.locator)
        for fallback in rule.fallbacks:
            _compile(fallback)
        if rule.required not in {"required", "expected", "optional"}:
            raise ValueError(f"invalid required flag: {rule.id}")


def _load_table(root: Path, name: str) -> dict[str, object]:
    path = root / name
    with path.open("rb") as handle:
        payload = tomllib.load(handle)
    if not isinstance(payload, dict):
        raise TypeError(f"rule file must be a table: {name}")
    return payload


def load_rules(root: Path) -> RuleSet:
    """Load ``root`` and reject selectors or normalisers that cannot run.

    Args:
        root: Directory that contains the TOML rule files.

    Returns:
        The frozen rule set.

    Raises:
        ValueError: A rule id, selector, normaliser or alias is invalid.
    """
    main = _load_table(root, "futbolfantasy.toml")
    labels = _load_table(root, "labels.es.toml")
    events = _load_table(root, "events.toml")
    competitions = _load_table(root, "competitions.toml")
    slugs = _load_table(root, "stat_slugs.toml")
    static = _load_table(root, "static_blocks.es.toml")
    try:
        rule_set = RuleSet.model_validate(
            {
                "version": main["version"],
                "rules": main.get("rules", []),
                "tables": main.get("tables", []),
                "labels": labels.get("labels", []),
                "events": events.get("events", []),
                "stat_slugs": slugs.get("stats", []),
                "competitions": competitions.get("competitions", []),
                "hierarchy": labels.get("hierarchy", {}),
                "static_blocks": static,
                "selectors": main["selectors"],
                "derivations": main.get("derivations", []),
                "unmapped_allowlist": main.get("unmapped_allowlist", []),
            }
        )
    except ValidationError as exc:
        raise ValueError("rule files do not match the schema") from exc
    _check_rules(list(rule_set.rules))
    _check_unique_events(list(rule_set.events))
    _check_competitions(list(rule_set.competitions))
    _check_labels(list(rule_set.labels))
    for table in rule_set.tables:
        _compile(table.row_locator)
        for column in table.columns:
            _compile(column.locator)
            if column.normaliser not in REGISTRY:
                raise ValueError(f"unknown normaliser: {column.normaliser}")
    for selector in _selector_values(rule_set.selectors):
        _compile(selector)
    return rule_set


def _selector_values(selectors: Selectors) -> list[str]:
    values: list[str] = []
    for name in type(selectors).model_fields:
        raw = getattr(selectors, name)
        if isinstance(raw, str):
            values.append(raw)
        elif isinstance(raw, list):
            values.extend(str(item) for item in raw)
    return values


def _check_unique_events(events: list[EventRule]) -> None:
    keys: set[str] = set()
    labels: set[str] = set()
    for event in events:
        if event.key in keys or event.label.casefold() in labels:
            raise ValueError("duplicate event key or label")
        keys.add(event.key)
        labels.add(event.label.casefold())


def _check_competitions(rows: list[CompetitionAlias]) -> None:
    seen: set[str] = set()
    for row in rows:
        token = row.prefix.casefold()
        if token in seen:
            raise ValueError("duplicate competition alias")
        seen.add(token)


def _check_labels(rows: list[LabelRule]) -> None:
    seen: set[str] = set()
    for row in rows:
        token = row.label.casefold()
        if token in seen:
            raise ValueError("duplicate stat label")
        seen.add(token)
        if row.normaliser not in REGISTRY:
            raise ValueError(f"unknown normaliser: {row.normaliser}")


@functools.cache
def cached_rules(root: str) -> RuleSet:
    """Load ``root`` once per process."""
    return load_rules(Path(root))


class RuleRepository:
    """The only parser component that reads rule files.

    Args:
        root: Rule directory. Defaults to the package ``rules`` folder.
    """

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or Path(__file__).resolve().parent

    def load(self) -> RuleSet:
        """Return the validated rule set.

        Returns:
            Cached rules for this directory.
        """
        return cached_rules(str(self.root))
