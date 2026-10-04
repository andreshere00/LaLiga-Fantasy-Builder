"""Market widget."""

import json
import re

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError
from fantasy_scraping.parser.extractors.base import ExtractionContext, column_values, rows_of
from fantasy_scraping.parser.models.futbolfantasy import (
    MarketBlock,
    MarketChange,
    MarketExtreme,
    MarketMove,
    MarketPoint,
)
from fantasy_scraping.parser.normalise.dates import day_month, resolve_day_month, resolve_sequence
from fantasy_scraping.parser.normalise.numbers import es_int, es_percent, signed_delta
from fantasy_scraping.parser.normalise.text import clean_text, map_minuses

_CHANGE = re.compile(r"^(?P<absolute>[+-]?\d[\d.]*)\s*\((?P<percent>[+-]?\d+(?:,\d+)?)\s*%\)$")
_EXTREME = re.compile(r"^(?P<value>\d[\d.]*)\s*\((?P<date>\d{1,2}/\d{1,2})\)$")
_WINDOW = re.compile(r"(\d+)")


def extract_market(ctx: ExtractionContext) -> MarketBlock | None:
    """Read the market block. A missing widget returns ``None``.

    Args:
        ctx: Extraction context.

    Returns:
        The market block, or ``None`` when the container is absent.
    """
    root = ctx.document.first(ctx.selector("market_root"))
    if root is None:
        ctx.miss("market")
        return None
    current = _optional_int(ctx, "market_value", "market.current_value")
    change = _change(ctx)
    maximum = _extreme(ctx, "market_max", "market.max_recent")
    minimum = _extreme(ctx, "market_min", "market.min_recent")
    window = _window(ctx)
    season = _text(ctx, "market_season")
    moves = _moves(ctx)
    series = _series(ctx)
    if change is not None and moves:
        change = change.model_copy(update={"date": moves[0].date})
    return MarketBlock(
        current_value=current,
        last_change=change,
        max_recent=maximum,
        min_recent=minimum,
        window_days=window,
        widget_season=season,
        daily_moves=moves,
        series=series,
    )


def _text(ctx: ExtractionContext, name: str) -> str | None:
    node = ctx.document.first(ctx.selector(name))
    if node is None:
        return None
    text = node_text(node)
    return text or None


def _optional_int(ctx: ExtractionContext, selector: str, path: str) -> int | None:
    node = ctx.document.first(ctx.selector(selector))
    if node is None:
        ctx.miss(path)
        ctx.warn(
            code="field_missing",
            section="market",
            path=path,
            rule_id=path,
            message="expected field missing",
        )
        return None
    try:
        return es_int(node_text(node))
    except NormaliseError:
        ctx.miss(path)
        return None


def _change(ctx: ExtractionContext) -> MarketChange | None:
    raw = _text(ctx, "market_change")
    if raw is None:
        ctx.miss("market.last_change")
        ctx.warn(
            code="field_missing",
            section="market",
            path="market.last_change",
            rule_id="market.last_change",
            message="expected field missing",
        )
        return None
    match = _CHANGE.fullmatch(map_minuses(clean_text(raw)).replace(" ", " "))
    compact = map_minuses(clean_text(raw))
    match = _CHANGE.fullmatch(compact)
    if match is None:
        ctx.miss("market.last_change")
        return None
    return MarketChange(
        absolute=signed_delta(match.group("absolute")),
        percent=es_percent(match.group("percent")),
    )


def _extreme(ctx: ExtractionContext, selector: str, path: str) -> MarketExtreme | None:
    raw = _text(ctx, selector)
    if raw is None:
        ctx.miss(path)
        return None
    match = _EXTREME.fullmatch(clean_text(raw))
    if match is None:
        ctx.miss(path)
        return None
    day, month = day_month(match.group("date"))
    when = resolve_day_month(day, month, ctx.page.fetched_at, "recent")
    return MarketExtreme(value=es_int(match.group("value")), date=when, derived=False)


def _window(ctx: ExtractionContext) -> int | None:
    raw = _text(ctx, "market_window")
    if raw is None:
        ctx.miss("market.window_days")
        return None
    match = _WINDOW.search(raw)
    if match is None:
        return None
    return int(match.group(1))


def _moves(ctx: ExtractionContext) -> list[MarketMove]:
    spec = ctx.table("market_moves")
    nodes = rows_of(ctx, spec)
    if not nodes:
        ctx.miss("market.daily_moves")
        return []
    pairs: list[tuple[int, int]] = []
    kept: list[dict[str, object]] = []
    for row in nodes:
        columns = column_values(ctx, row, spec)
        raw_date = columns.get("date")
        if not isinstance(raw_date, str) or not isinstance(columns.get("change"), int):
            continue
        if not isinstance(columns.get("value"), int):
            continue
        pairs.append(day_month(raw_date))
        kept.append(columns)
    dates = resolve_sequence(pairs, ctx.page.fetched_at, "recent") if pairs else []
    return [
        MarketMove(date=when, change=int(columns["change"]), value=int(columns["value"]))
        for when, columns in zip(dates, kept, strict=True)
    ]


def _series(ctx: ExtractionContext) -> list[MarketPoint] | None:
    raw = ctx.document.market_series_json
    if not raw:
        ctx.miss("market.series")
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        ctx.miss("market.series")
        ctx.warn(
            code="field_invalid",
            section="market",
            path="market.series",
            rule_id="market.series",
            message="field could not be parsed",
        )
        return None
    if not isinstance(payload, list):
        ctx.miss("market.series")
        return None
    points: list[MarketPoint] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        raw_date = item.get("date")
        raw_value = item.get("value")
        if not isinstance(raw_date, str) or not isinstance(raw_value, int):
            continue
        day, month = day_month(raw_date)
        when = resolve_day_month(day, month, ctx.page.fetched_at, "recent")
        points.append(MarketPoint(date=when, value=raw_value))
    return points
