"""LaLiga Fantasy Oficial aggregates."""

import re

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.extractors.base import (
    ExtractionContext,
    apply_rules,
    column_values,
    rows_of,
)
from fantasy_scraping.parser.models.futbolfantasy import FantasyPoints, GrossNet, ScoringMode
from fantasy_scraping.parser.normalise.numbers import dash_decimal
from fantasy_scraping.parser.normalise.text import clean_text

_MATCHES = re.compile(r"(\d+)")
_OFFICIAL = "LaLiga Fantasy Oficial"


def extract_fantasy_points(ctx: ExtractionContext) -> FantasyPoints:
    """Read the official scoring block.

    Args:
        ctx: Extraction context.

    Returns:
        Official aggregates. A missing block is zeroes plus ``points_mode_missing``.
    """
    root = ctx.document.first(ctx.selector("points_root"))
    if root is None:
        ctx.miss("fantasy_points")
        ctx.warn(
            code="points_mode_missing",
            section="fantasy_points",
            path="fantasy_points",
            rule_id="fantasy_points.mode",
            message="official points block missing",
            severity="warning",
        )
        return _zero("")
    values = apply_rules(ctx, "fantasy_points")
    mode = str(values.get("fantasy_points.mode") or root.get("data-modo") or "")
    if mode != _OFFICIAL:
        ctx.warn(
            code="points_mode_missing",
            section="fantasy_points",
            path="fantasy_points.mode",
            rule_id="fantasy_points.mode",
            message="official points block missing",
            preview=mode,
        )
        return _zero(mode)
    rows = {str(item.get("label")): item for item in _rows(ctx)}
    total = _pair(rows.get("Total"), "gross", "net")
    home = _pair(rows.get("Total"), "home_gross", "home_net")
    away = _pair(rows.get("Total"), "away_gross", "away_net")
    average = _pair(rows.get("Media"), "gross", "net")
    average_home = _pair(rows.get("Media"), "home_gross", "home_net")
    average_away = _pair(rows.get("Media"), "away_gross", "away_net")
    last = ctx.document.first(ctx.selector("points_last3"))
    last_value = dash_decimal(node_text(last)) if last is not None else None
    return FantasyPoints(
        mode=mode,
        matches_counted=_counted(ctx),
        total=total,
        total_home=home,
        total_away=away,
        average=average,
        average_home=average_home,
        average_away=average_away,
        average_last_3=GrossNet(gross=last_value, net=last_value),
        scoring_modes=_modes(ctx),
    )


def _rows(ctx: ExtractionContext) -> list[dict[str, object]]:
    spec = ctx.table("points")
    return [column_values(ctx, row, spec) for row in rows_of(ctx, spec)]


def _pair(row: dict[str, object] | None, gross_key: str, net_key: str) -> GrossNet:
    if row is None:
        return GrossNet()
    gross = row.get(gross_key)
    net = row.get(net_key)
    return GrossNet(
        gross=gross if isinstance(gross, float) else None,
        net=net if isinstance(net, float) else None,
    )


def _counted(ctx: ExtractionContext) -> int | None:
    node = ctx.document.first(ctx.selector("points_matches"))
    if node is None:
        return None
    match = _MATCHES.search(node_text(node))
    return int(match.group(1)) if match else None


def _modes(ctx: ExtractionContext) -> list[ScoringMode]:
    modes: list[ScoringMode] = []
    for node in ctx.document.css(ctx.selector("points_mode_item")):
        text = clean_text(node_text(node))
        if not text:
            continue
        if "(" in text and text.endswith(")"):
            platform, rest = text.split("(", 1)
            variants = [part.strip() for part in rest[:-1].split(",") if part.strip()]
            modes.append(ScoringMode(platform=clean_text(platform), variants=variants))
        else:
            modes.append(ScoringMode(platform=text))
    return modes


def _zero(mode: str) -> FantasyPoints:
    blank = GrossNet(gross=0.0, net=0.0)
    return FantasyPoints(
        mode=mode,
        total=blank,
        total_home=blank,
        total_away=blank,
        average=blank,
        average_home=blank,
        average_away=blank,
        average_last_3=blank,
    )
