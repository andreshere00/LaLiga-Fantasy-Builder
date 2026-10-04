"""Fixture table, per-match layers and the 19 DAZN fields."""

import html
import json
import re
from typing import Any

from lxml.html import HtmlElement

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError, ParserSectionError
from fantasy_scraping.parser.extractors.base import ExtractionContext, rows_with_dates
from fantasy_scraping.parser.extractors.matches import competition_from_slug
from fantasy_scraping.parser.models.common import Competition
from fantasy_scraping.parser.models.futbolfantasy import (
    EventCount,
    EventStat,
    FixtureLayers,
    FixtureMatch,
    FixtureRow,
    IconEvent,
    RelevoLayer,
)
from fantasy_scraping.parser.models.stats import (
    DaznStats,
    implied_zero,
    line,
    not_applicable,
    unavailable,
)
from fantasy_scraping.parser.normalise.identity import data_local_side
from fantasy_scraping.parser.normalise.minutes import minutes_note
from fantasy_scraping.parser.normalise.numbers import es_int
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text, map_minuses
from fantasy_scraping.parser.rules.schema import EventRule

_MATCH = re.compile(r"([A-Za-z]{2,4})\s+(\d+)\s*[-–−]\s*(\d+)\s+([A-Za-z]{2,4})")
_LAYER_POINTS = re.compile(r"^(\d+)\s+(.+?)\s*(?:→|->)\s*([+-]?\d+)\s+p$")
_LAYER_PAIR = re.compile(r"^(.+?)\s+\((\d+)/(\d+)\)$")
_LAYER_COUNT = re.compile(r"^(.+?)\s+\((\d+)\)$")
_GK_FIELDS = {"penalties_saved", "saves"}
_SHOT_PARTS = ("tiros-puerta", "tiros-palo", "tiros-bloqueados")
_ICON_KINDS = {"goal", "assist", "penalty", "yellow_card", "red_card"}


def extract_fixtures(ctx: ExtractionContext, *, is_goalkeeper: bool) -> list[FixtureRow]:
    """Read match rows and their stat layers.

    Args:
        ctx: Extraction context.
        is_goalkeeper: Goalkeeper-only metrics stay not applicable otherwise.

    Returns:
        Rows in page order.

    Raises:
        ParserSectionError: The fixtures table is missing.
    """
    if ctx.document.first(ctx.selector("fixtures_table")) is None:
        raise ParserSectionError(
            "required_anchor_missing",
            "fixtures table missing",
            section="fixtures",
        )
    spec = _fixture_table_spec(ctx)
    payloads = _poligono(ctx)
    competition = competition_from_slug(ctx, ctx.page.season_slug or _slug_from_url(ctx))
    is_laliga = competition == Competition.LALIGA
    dated = rows_with_dates(
        ctx,
        spec,
        section="fixtures",
        direction="recent",
        accept=_fixture_columns,
        require_date=False,
    )
    fixtures: list[FixtureRow] = []
    for index, (row, columns, when) in enumerate(dated):
        if spec.id == "fixtures_live":
            columns = dict(columns)
            local = row.get("data-local")
            if local is not None:
                columns["side"] = data_local_side(local)
        match = _match(str(columns["match"]))
        if match is None:
            ctx.warn(
                code="row_dropped",
                section="fixtures",
                path="fixtures",
                rule_id="fixtures",
                message="row dropped",
                index=index,
            )
            continue
        starter = casefold_key(str(columns.get("starter") or "")) == "titular"
        note = minutes_note(str(columns.get("minutes") or ""), starter=starter)
        if note.event == "subbed_off" and note.minutes is None:
            ctx.warn(
                code="minutes_assumed_unknown",
                section="fixtures",
                path="fixtures.minutes_out",
                rule_id="fixtures.minutes_out",
                message="minutes need a starter flag",
                index=index,
            )
        payload = payloads[index] if index < len(payloads) else None
        stats, layers, extra = _stats(
            ctx,
            row,
            note_minutes=note.minutes,
            payload=payload,
            is_goalkeeper=is_goalkeeper,
            is_laliga=is_laliga,
            dazn=columns.get("dazn") if isinstance(columns.get("dazn"), int) else None,
        )
        icons, unknown = _icons(ctx, row)
        if unknown:
            ctx.warn(
                code="icon_unmapped",
                section="fixtures",
                path="fixtures.icon_events",
                rule_id="fixtures.icon_events",
                message="icon is not mapped",
                index=index,
            )
        side = _side(columns.get("side"))
        fixtures.append(
            FixtureRow(
                date=when,
                matchday=int(columns["matchday"]),
                match=match,
                player_side=side,
                minutes_out=note,
                stars=columns.get("stars") if isinstance(columns.get("stars"), int) else None,
                grade=columns.get("grade") if isinstance(columns.get("grade"), float) else None,
                dazn_points=columns.get("dazn") if isinstance(columns.get("dazn"), int) else None,
                week_points=(
                    columns.get("points") if isinstance(columns.get("points"), int) else None
                ),
                icon_events=icons,
                stats=stats,
                extra_events=extra,
                layers=layers,
                competition=competition,
                competition_slug=ctx.page.season_slug or _slug_from_url(ctx),
                starter=starter,
            )
        )
    _check_point_sums(ctx, fixtures)
    return fixtures


def _fixture_table_spec(ctx: ExtractionContext):
    """Pick the trimmed fixture table or the live ``tablestats`` layout."""
    if ctx.document.first("table.partidos") is not None:
        return ctx.table("fixtures")
    return ctx.table("fixtures_live")


def _fixture_columns(columns: dict[str, Any]) -> bool:
    """Keep fixture rows that publish a match line and a matchday."""
    return isinstance(columns.get("match"), str) and isinstance(columns.get("matchday"), int)


def _slug_from_url(ctx: ExtractionContext) -> str:
    parts = [part for part in ctx.page.url.rstrip("/").split("/") if part]
    if len(parts) >= 1:
        return parts[-1]
    return ""


def _match(value: str) -> FixtureMatch | None:
    found = _MATCH.search(map_minuses(clean_text(value)))
    if found is None:
        return None
    return FixtureMatch(
        home_code=found.group(1).upper(),
        away_code=found.group(4).upper(),
        home_goals=int(found.group(2)),
        away_goals=int(found.group(3)),
    )


def _side(value: object) -> str | None:
    key = casefold_key(str(value or ""))
    if key in {"local", "casa", "home"}:
        return "home"
    if key in {"visitante", "fuera", "away"}:
        return "away"
    return None


def _poligono(ctx: ExtractionContext) -> list[dict[str, object]]:
    node = ctx.document.first(ctx.selector("poligono"))
    if node is None:
        return []
    raw = html.unescape(node.get("data-indices") or "")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        ctx.warn(
            code="field_invalid",
            section="fixtures",
            path="fixtures.stats",
            rule_id="fixtures.poligono",
            message="field could not be parsed",
        )
        return []
    info = payload.get("partidos_info") if isinstance(payload, dict) else None
    if isinstance(info, str):
        try:
            info = json.loads(info)
        except json.JSONDecodeError:
            return []
    if not isinstance(info, list):
        return []
    return [item for item in info if isinstance(item, dict)]


def _icons(ctx: ExtractionContext, row: HtmlElement) -> tuple[list[IconEvent], bool]:
    events = [item for item in ctx.rules.events if item.icon]
    known = {item.icon for item in events}
    icons: list[IconEvent] = []
    for event in events:
        if event.key not in _ICON_KINDS:
            continue
        count = len(row.cssselect(f"i.{event.icon}"))
        if count:
            icons.append(IconEvent(kind=event.key, count=count))
    unknown = False
    for node in row.cssselect("i"):
        classes = set((node.get("class") or "").split())
        if classes and not classes & known:
            unknown = True
    return icons, unknown


def _stats(
    ctx: ExtractionContext,
    row: HtmlElement,
    *,
    note_minutes: int | None,
    payload: dict[str, object] | None,
    is_goalkeeper: bool,
    is_laliga: bool,
    dazn: int | None,
) -> tuple[DaznStats, FixtureLayers | None, list[EventStat]]:
    counts = _stat_counts(row)
    layer_nodes = row.cssselect("div.estadistica")
    layer_present = bool(layer_nodes)
    points_by_field: dict[str, float] = {}
    count_by_field: dict[str, int] = {}
    statistical: list[EventStat] = []
    events: list[EventCount] = []
    extra: list[EventStat] = []
    for node in layer_nodes:
        _read_layer(
            ctx, node_text(node), points_by_field, count_by_field, statistical, events, extra
        )
    values: dict[str, object] = {}
    grouped: dict[str, list[object]] = {}
    for spec in ctx.rules.stat_slugs:
        if spec.shot_part or spec.field == "shots":
            continue
        grouped.setdefault(spec.field, []).append(spec)
    for field_name, specs in grouped.items():
        values[field_name] = _field_from_specs(
            field_name,
            specs,
            counts,
            count_by_field,
            points_by_field,
            payload,
            layer_present,
            is_goalkeeper,
        )
    values["shots"] = _shots(counts, count_by_field, points_by_field, payload, layer_present)
    values["minutes_played"] = line(
        count=note_minutes,
        points=points_by_field.get("minutes_played", 0.0),
        status="ok" if note_minutes is not None else "unavailable",
        source="futbolfantasy" if note_minutes is not None else None,
        reason=None if note_minutes is not None else "minutes_assumed_unknown",
    )
    if is_laliga:
        values["dazn_points"] = line(count=None, points=float(dazn or 0), status="ok")
    else:
        values["dazn_points"] = unavailable("league_only")
    layers = None
    if layer_present or events:
        layers = FixtureLayers(
            statistical_points=statistical or None,
            relevo=RelevoLayer(dazn_points=dazn or 0) if dazn is not None and is_laliga else None,
            events=events or None,
        )
    return DaznStats(**values), layers, extra  # type: ignore[arg-type]


def _field_from_specs(
    field_name: str,
    specs: list[object],
    counts: dict[str, int],
    from_layer: dict[str, int],
    points: dict[str, float],
    payload: dict[str, object] | None,
    layer_present: bool,
    is_goalkeeper: bool,
) -> object:
    from fantasy_scraping.parser.rules.schema import StatSlug

    typed = [spec for spec in specs if isinstance(spec, StatSlug)]
    published = any(
        spec.slug in counts or (spec.json_key and payload and spec.json_key in payload)
        for spec in typed
    )
    goalkeeper_only = field_name in _GK_FIELDS and not is_goalkeeper
    if goalkeeper_only and field_name not in from_layer and not published:
        return not_applicable()
    for spec in typed:
        if spec.slug in counts:
            return line(count=counts[spec.slug], points=points.get(field_name, 0.0), status="ok")
    if field_name in from_layer:
        return line(count=from_layer[field_name], points=points.get(field_name, 0.0), status="ok")
    for spec in typed:
        if payload is not None and spec.json_key and isinstance(payload.get(spec.json_key), int):
            return line(
                count=int(payload[spec.json_key]),
                points=points.get(field_name, 0.0),
                status="ok",
            )
    return implied_zero() if layer_present else unavailable("layer_missing")


def _shots(
    counts: dict[str, int],
    from_layer: dict[str, int],
    points: dict[str, float],
    payload: dict[str, object] | None,
    layer_present: bool,
) -> object:
    if "tiros-totales" in counts:
        return line(count=counts["tiros-totales"], points=points.get("shots", 0.0), status="ok")
    if "shots" in from_layer:
        return line(count=from_layer["shots"], points=points.get("shots", 0.0), status="ok")
    if payload is not None and isinstance(payload.get("tiros"), int):
        return line(count=int(payload["tiros"]), points=points.get("shots", 0.0), status="ok")
    parts = [counts[slug] for slug in _SHOT_PARTS if slug in counts]
    if parts:
        return line(
            count=sum(parts),
            points=points.get("shots", 0.0),
            status="partial",
            reason="no_per_match_total",
        )
    return implied_zero() if layer_present else unavailable("layer_missing")


def _stat_counts(row: HtmlElement) -> dict[str, int]:
    found: dict[str, int] = {}
    for span in row.cssselect("span.stat-val"):
        classes = (span.get("class") or "").split()
        for class_name in classes:
            if not class_name.startswith("stat-") or class_name == "stat-val":
                continue
            try:
                found[class_name.removeprefix("stat-")] = es_int(node_text(span))
            except NormaliseError:
                continue
    return found


def _read_layer(
    ctx: ExtractionContext,
    text: str,
    points: dict[str, float],
    counts: dict[str, int],
    statistical: list[EventStat],
    events: list[EventCount],
    extra: list[EventStat],
) -> None:
    cleaned = clean_text(map_minuses(text))
    points_match = _LAYER_POINTS.fullmatch(cleaned)
    if points_match:
        count = int(points_match.group(1))
        label = points_match.group(2)
        score = float(points_match.group(3))
        event = _event_for(ctx, label)
        if event is None:
            return
        if event.key == "second_yellow":
            count = 2
        _store(event, count, score, points, counts, statistical, extra)
        return
    pair = _LAYER_PAIR.fullmatch(cleaned)
    if pair:
        event = _event_for(ctx, pair.group(1))
        if event is not None and event.key == "clear_chances_pair":
            events.append(
                EventCount(
                    event="big_chances_created", label="oc. creadas", count=int(pair.group(2))
                )
            )
            events.append(
                EventCount(
                    event="big_chances_missed", label="oc. falladas", count=int(pair.group(3))
                )
            )
        return
    count_match = _LAYER_COUNT.fullmatch(cleaned)
    if count_match is None:
        return
    event = _event_for(ctx, count_match.group(1))
    if event is None:
        return
    count = int(count_match.group(2))
    events.append(EventCount(event=event.key, label=event.md_label, count=count))
    if event.dazn_field:
        counts[event.dazn_field] = count


def _store(
    event: EventRule,
    count: int,
    score: float,
    points: dict[str, float],
    counts: dict[str, int],
    statistical: list[EventStat],
    extra: list[EventStat],
) -> None:
    statistical.append(EventStat(event=event.key, label=event.label, count=count, points=score))
    if not event.dazn_field:
        extra.append(EventStat(event=event.key, label=event.md_label, count=count, points=score))
        return
    counts[event.dazn_field] = counts.get(event.dazn_field, 0) + count
    points[event.dazn_field] = points.get(event.dazn_field, 0.0) + score


def _event_for(ctx: ExtractionContext, label: str) -> EventRule | None:
    key = casefold_key(label)
    for event in ctx.rules.events:
        if casefold_key(event.label) == key:
            return event
    return None


def _check_point_sums(ctx: ExtractionContext, fixtures: list[FixtureRow]) -> None:
    for index, fixture in enumerate(fixtures):
        total = 0.0
        for name in type(fixture.stats).model_fields:
            if name == "dazn_points":
                continue
            stat = getattr(fixture.stats, name)
            total += float(stat.points)
        if fixture.week_points is not None and int(total) != fixture.week_points:
            ctx.warn(
                code="points_total_mismatch",
                section="fixtures",
                path="fixtures.week_points",
                rule_id="fixtures.week_points",
                message="stat points do not add up to the match total",
                index=index,
            )
