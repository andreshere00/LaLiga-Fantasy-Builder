"""Fixture table, per-match layers and the 19 DAZN fields."""

import html
import json
import re
from datetime import date
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
_LAYER_POINTS_LOOSE = re.compile(r"^(\d+)\s+(.+?)\s+([+-]?\d+)\s+p$")
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
        official_nodes = _official_layer_nodes(row)
        stats, layers, extra = _stats(
            ctx,
            row,
            note_minutes=note.minutes,
            payload=payload,
            is_goalkeeper=is_goalkeeper,
            is_laliga=is_laliga,
            dazn=columns.get("dazn") if isinstance(columns.get("dazn"), int) else None,
            official_nodes=official_nodes,
        )
        scored_minutes = stats.minutes_played.count
        if scored_minutes is not None and note.minutes != scored_minutes:
            note = note.model_copy(
                update={
                    "minutes": scored_minutes,
                    "minute": scored_minutes,
                    "event": "full" if note.event == "unknown" else note.event,
                    "raw": note.raw or f"{scored_minutes}'",
                }
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
    fixtures = _fill_dates_from_poligono(ctx, fixtures)
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
    if key in {"local", "casa", "home", "si", "1"}:
        return "home"
    if key in {"visitante", "fuera", "away", "no", "0"}:
        return "away"
    return None


def _fill_dates_from_poligono(
    ctx: ExtractionContext,
    fixtures: list[FixtureRow],
) -> list[FixtureRow]:
    """Use poligono match dates when the fixtures table left every row undated."""
    if not fixtures or any(row.date is not None for row in fixtures):
        return fixtures
    dates = _poligono_dates(ctx)
    if len(dates) < len(fixtures):
        return fixtures
    dates.sort(reverse=True)
    return [row.model_copy(update={"date": dates[index]}) for index, row in enumerate(fixtures)]


def _poligono_dates(ctx: ExtractionContext) -> list[date]:
    node = ctx.document.first(ctx.selector("poligono"))
    if node is None:
        return []
    raw = html.unescape(node.get("data-indices") or "")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return []
    info = payload.get("partidos_info") if isinstance(payload, dict) else None
    if isinstance(info, str):
        try:
            info = json.loads(info)
        except json.JSONDecodeError:
            return []
    rows: list[object]
    if isinstance(info, dict):
        rows = list(info.values())
    elif isinstance(info, list):
        rows = info
    else:
        return []
    dates: list[date] = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        raw_date = item.get("fecha")
        if not isinstance(raw_date, str):
            continue
        try:
            dates.append(date.fromisoformat(raw_date[:10]))
        except ValueError:
            continue
    return dates


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


def _official_layer_nodes(row: HtmlElement) -> list[HtmlElement]:
    """LaLiga Fantasy lines on the following breakdown row."""
    sibling = row.getnext()
    if sibling is None or "desglose" not in (sibling.get("class") or "").split():
        return []
    return list(sibling.cssselect("div.desg.laliga-fantasy div.estadistica"))


def _stats(
    ctx: ExtractionContext,
    row: HtmlElement,
    *,
    note_minutes: int | None,
    payload: dict[str, object] | None,
    is_goalkeeper: bool,
    is_laliga: bool,
    dazn: int | None,
    official_nodes: list[HtmlElement] | None = None,
) -> tuple[DaznStats, FixtureLayers | None, list[EventStat]]:
    counts = _stat_counts(row)
    official = bool(official_nodes)
    layer_nodes = official_nodes if official else row.cssselect("div.estadistica")
    layer_present = bool(layer_nodes)
    points_by_field: dict[str, float] = {}
    count_by_field: dict[str, int] = {}
    field_owners: dict[str, str] = {}
    statistical: list[EventStat] = []
    events: list[EventCount] = []
    extra: list[EventStat] = []
    for node in layer_nodes:
        _read_layer(
            ctx,
            node_text(node),
            points_by_field,
            count_by_field,
            statistical,
            events,
            extra,
            field_owners,
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
            official=official,
        )
    values["shots"] = _shots(
        counts,
        count_by_field,
        points_by_field,
        payload,
        layer_present,
        official=official,
    )
    scored_minutes = count_by_field.get("minutes_played") if official else None
    minute_count = scored_minutes if scored_minutes is not None else note_minutes
    values["minutes_played"] = line(
        count=minute_count,
        points=_layer_points(points_by_field, "minutes_played"),
        status="ok" if minute_count is not None else "unavailable",
        source="futbolfantasy" if minute_count is not None else None,
        reason=None if minute_count is not None else "minutes_assumed_unknown",
    )
    if is_laliga:
        values["dazn_points"] = line(
            count=None,
            points=float(dazn) if dazn is not None else None,
            status="ok",
        )
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


def _layer_points(points: dict[str, float], field_name: str) -> float | None:
    return points.get(field_name)


def _field_from_specs(
    field_name: str,
    specs: list[object],
    counts: dict[str, int],
    from_layer: dict[str, int],
    points: dict[str, float],
    payload: dict[str, object] | None,
    layer_present: bool,
    is_goalkeeper: bool,
    official: bool = False,
) -> object:
    from fantasy_scraping.parser.rules.schema import StatSlug

    typed = [spec for spec in specs if isinstance(spec, StatSlug)]
    published = any(
        spec.slug in counts or (spec.json_key and payload and spec.json_key in payload)
        for spec in typed
    )
    if official and field_name in from_layer:
        return line(
            count=from_layer[field_name],
            points=_layer_points(points, field_name),
            status="ok",
        )
    goalkeeper_only = field_name in _GK_FIELDS and not is_goalkeeper
    if goalkeeper_only and field_name not in from_layer and not published:
        return not_applicable()
    for spec in typed:
        if spec.slug in counts:
            return line(
                count=counts[spec.slug],
                points=_layer_points(points, field_name),
                status="ok",
            )
    if field_name in from_layer:
        return line(
            count=from_layer[field_name],
            points=_layer_points(points, field_name),
            status="ok",
        )
    for spec in typed:
        if payload is not None and spec.json_key and isinstance(payload.get(spec.json_key), int):
            return line(
                count=int(payload[spec.json_key]),
                points=_layer_points(points, field_name),
                status="ok",
            )
    return implied_zero() if layer_present else unavailable("layer_missing")


def _shots(
    counts: dict[str, int],
    from_layer: dict[str, int],
    points: dict[str, float],
    payload: dict[str, object] | None,
    layer_present: bool,
    official: bool = False,
) -> object:
    if official and "shots" in from_layer:
        return line(
            count=from_layer["shots"],
            points=_layer_points(points, "shots"),
            status="ok",
        )
    on_target = payload.get("tiros_puerta") if payload is not None else None
    if isinstance(on_target, int):
        return line(
            count=on_target,
            points=_layer_points(points, "shots"),
            status="ok",
        )
    if "tiros-totales" in counts:
        return line(
            count=counts["tiros-totales"],
            points=_layer_points(points, "shots"),
            status="ok",
        )
    if "shots" in from_layer:
        return line(
            count=from_layer["shots"],
            points=_layer_points(points, "shots"),
            status="ok",
        )
    if payload is not None and isinstance(payload.get("tiros"), int):
        return line(
            count=int(payload["tiros"]),
            points=_layer_points(points, "shots"),
            status="ok",
        )
    json_parts = _json_shot_parts(payload)
    if json_parts:
        return line(
            count=sum(json_parts),
            points=_layer_points(points, "shots"),
            status="partial",
            reason="no_per_match_total",
        )
    parts = [counts[slug] for slug in _SHOT_PARTS if slug in counts]
    if parts:
        return line(
            count=sum(parts),
            points=_layer_points(points, "shots"),
            status="partial",
            reason="no_per_match_total",
        )
    return implied_zero() if layer_present else unavailable("layer_missing")


def _json_shot_parts(payload: dict[str, object] | None) -> list[int]:
    """Collect integer shot components from a match JSON payload."""
    if payload is None:
        return []
    keys = ("tiros_puerta", "tiros_palo", "tiros_bloqueados")
    return [int(payload[key]) for key in keys if isinstance(payload.get(key), int)]


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
    owners: dict[str, str],
) -> None:
    cleaned = clean_text(map_minuses(text))
    points_match = _LAYER_POINTS.fullmatch(cleaned) or _LAYER_POINTS_LOOSE.fullmatch(cleaned)
    if points_match:
        count = int(points_match.group(1))
        label = points_match.group(2)
        score = float(points_match.group(3))
        event = _event_for(ctx, label)
        if event is None:
            return
        if event.key == "second_yellow":
            count = 2
        _store(event, count, score, points, counts, statistical, extra, owners)
        return
    pair = _LAYER_PAIR.fullmatch(cleaned)
    if pair:
        event = _event_for(ctx, pair.group(1))
        if event is not None and event.key == "clear_chances_pair":
            created = int(pair.group(2))
            missed = int(pair.group(3))
            events.append(
                EventCount(event="big_chances_created", label="oc. creadas", count=created)
            )
            events.append(
                EventCount(event="big_chances_missed", label="oc. falladas", count=missed)
            )
            counts["big_chances_created"] = created
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


# Alias label yields to the primary event when both name the same stat field.
_ALIAS_OF: dict[str, str] = {
    "shots": "shots_on_target",
    "dribbles_short": "dribbles",
    "goals_conceded_against": "goals_conceded",
}


def _store(
    event: EventRule,
    count: int,
    score: float,
    points: dict[str, float],
    counts: dict[str, int],
    statistical: list[EventStat],
    extra: list[EventStat],
    owners: dict[str, str],
) -> None:
    statistical.append(EventStat(event=event.key, label=event.label, count=count, points=score))
    if not event.dazn_field:
        extra.append(EventStat(event=event.key, label=event.md_label, count=count, points=score))
        return
    _merge_counted_field(event, count, score, points, counts, owners)


def _merge_counted_field(
    event: EventRule,
    count: int,
    score: float,
    points: dict[str, float],
    counts: dict[str, int],
    owners: dict[str, str],
) -> None:
    """Keep the primary label when two lines share a field; otherwise add."""
    field = event.dazn_field
    owner = owners.get(field)
    if owner is not None and _ALIAS_OF.get(event.key) == owner:
        return
    if owner is None or _ALIAS_OF.get(owner) == event.key:
        counts[field] = count
        points[field] = score
        owners[field] = event.key
        return
    counts[field] = counts.get(field, 0) + count
    points[field] = points.get(field, 0.0) + score


def _event_for(ctx: ExtractionContext, label: str) -> EventRule | None:
    key = casefold_key(label)
    for event in ctx.rules.events:
        if casefold_key(event.label) == key:
            return event
    return None


def _check_point_sums(ctx: ExtractionContext, fixtures: list[FixtureRow]) -> None:
    for index, fixture in enumerate(fixtures):
        actions = 0.0
        dazn = 0.0
        for name in type(fixture.stats).model_fields:
            stat = getattr(fixture.stats, name)
            if stat.points is None:
                continue
            if name == "dazn_points":
                dazn += float(stat.points)
            else:
                actions += float(stat.points)
        week = fixture.week_points
        matches = week is not None and (int(actions) == week or int(actions + dazn) == week)
        if week is not None and not matches:
            ctx.warn(
                code="points_total_mismatch",
                section="fixtures",
                path="fixtures.week_points",
                rule_id="fixtures.week_points",
                message="stat points do not add up to the match total",
                index=index,
            )
