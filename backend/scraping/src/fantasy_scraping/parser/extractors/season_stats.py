"""Season totals from the stats block."""

import re

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError, ParserSectionError
from fantasy_scraping.parser.extractors.base import (
    ExtractionContext,
    fill_model,
    group_present,
    label_pairs,
    values_for_group,
    warn_unknown_labels,
)
from fantasy_scraping.parser.models.common import LabeledValue, StatGroup
from fantasy_scraping.parser.models.futbolfantasy import (
    AttackStats,
    DefenseStats,
    DisciplineStats,
    GoalkeeperStats,
    Participation,
    SeasonStats,
)
from fantasy_scraping.parser.normalise.numbers import es_int
from fantasy_scraping.parser.normalise.ratios import ratio

_MATCHES = re.compile(r"(\d+)")
_GROUPS = {
    "participation": ("season_stats.participation", Participation),
    "attack": ("season_stats.attack", AttackStats),
    "discipline": ("season_stats.discipline", DisciplineStats),
    "defense": ("season_stats.defense", DefenseStats),
    "goalkeeper": ("season_stats.goalkeeper", GoalkeeperStats),
}


def extract_season_stats(ctx: ExtractionContext) -> SeasonStats | None:
    """Read season totals. A missing stats root fails the core section.

    Args:
        ctx: Extraction context.

    Returns:
        Season totals. Groups with no published label stay ``None``.

    Raises:
        ParserSectionError: The stats container is missing.
    """
    root = ctx.document.first(ctx.selector("stats_root"))
    if root is None:
        raise ParserSectionError(
            "required_anchor_missing",
            "season stats missing",
            section="season_stats",
        )
    pairs = label_pairs(root)
    warn_unknown_labels(ctx, pairs, "season_stats")
    values: dict[str, object] = {}
    built: dict[str, object] = {}
    for group, (prefix, model_cls) in _GROUPS.items():
        if not group_present(ctx, pairs, group):
            built[group] = None
            ctx.warn(
                code="field_missing",
                section="season_stats",
                path=prefix,
                rule_id=prefix,
                message="expected field missing",
            )
            continue
        values.update(values_for_group(ctx, pairs, group))
        built[group] = fill_model(model_cls, values, prefix)
    return SeasonStats(
        view=_view(ctx),
        matches_counted=_matches(ctx),
        participation=built["participation"],  # type: ignore[arg-type]
        attack=built["attack"],  # type: ignore[arg-type]
        discipline=built["discipline"],  # type: ignore[arg-type]
        defense=built["defense"],  # type: ignore[arg-type]
        goalkeeper=built["goalkeeper"],  # type: ignore[arg-type]
        other=_other(ctx, pairs),
        selector_catalog=_catalog(ctx),
    )


def _view(ctx: ExtractionContext) -> str | None:
    node = ctx.document.first(ctx.selector("stats_view"))
    if node is None:
        return None
    text = node_text(node).casefold()
    if "total" in text:
        return "totals"
    if "desglose" in text:
        return "breakdown"
    return None


def _matches(ctx: ExtractionContext) -> int | None:
    node = ctx.document.first(ctx.selector("stats_matches"))
    if node is None:
        return None
    match = _MATCHES.search(node_text(node))
    return int(match.group(1)) if match else None


def _other(ctx: ExtractionContext, pairs: list[tuple[str, str]]) -> list[LabeledValue]:
    known = {item.label.casefold() for item in ctx.rules.labels}
    extras: list[LabeledValue] = []
    for label, raw in pairs:
        if label.casefold() in known:
            continue
        parsed_int = None
        parsed_ratio = None
        try:
            parsed_int = es_int(raw)
        except NormaliseError:
            try:
                parsed_ratio = ratio(raw)
            except NormaliseError:
                parsed_ratio = None
        extras.append(
            LabeledValue(label=label, raw=raw, parsed_int=parsed_int, parsed_ratio=parsed_ratio)
        )
    return extras


def _catalog(ctx: ExtractionContext) -> list[StatGroup]:
    groups: list[StatGroup] = []
    for node in ctx.document.css(ctx.selector("selector_group")):
        label = node.get("label") or ""
        stats = [node_text(option) for option in node.cssselect("option") if node_text(option)]
        if label:
            groups.append(StatGroup(group=label, stats=stats))
    return groups
