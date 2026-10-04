"""Injury map and history."""

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError, ParserSectionError
from fantasy_scraping.parser.extractors.base import ExtractionContext, column_values, rows_of
from fantasy_scraping.parser.models.futbolfantasy import BodyZoneCount, InjuryEntry, InjuryHistory
from fantasy_scraping.parser.normalise.dates import date_dmy
from fantasy_scraping.parser.normalise.numbers import es_int
from fantasy_scraping.parser.normalise.text import casefold_key


def extract_injuries(ctx: ExtractionContext) -> InjuryHistory | None:
    """Read the body map and the history table.

    Args:
        ctx: Extraction context.

    Returns:
        The history block. A present table with zero rows yields an empty list.
    """
    root = ctx.document.first(ctx.selector("injury_root"))
    if root is None:
        ctx.miss("profile.injury_history")
        ctx.warn(
            code="field_missing",
            section="injuries",
            path="profile.injury_history",
            rule_id="profile.injury_history",
            message="expected field missing",
        )
        return None
    zones = _zones(ctx)
    note_node = ctx.document.first(ctx.selector("injury_note"))
    note = node_text(note_node) if note_node is not None else None
    table = ctx.document.first("table.historial")
    if table is None:
        raise ParserSectionError(
            "required_anchor_missing",
            "injury table missing",
            section="injuries",
        )
    entries = _entries(ctx)
    return InjuryHistory(body_map=zones, body_map_note=note or None, entries=entries)


def _zones(ctx: ExtractionContext) -> list[BodyZoneCount]:
    zones: list[BodyZoneCount] = []
    for node in ctx.document.css(ctx.selector("injury_zone")):
        zone = node.get("data-zona") or ""
        raw_count = node.get("data-incidencias") or "0"
        try:
            incidents = es_int(raw_count)
        except NormaliseError:
            continue
        if zone:
            zones.append(BodyZoneCount(zone=zone, incidents=incidents))
    return zones


def _entries(ctx: ExtractionContext) -> list[InjuryEntry]:
    spec = ctx.table("injuries")
    entries: list[InjuryEntry] = []
    for index, row in enumerate(rows_of(ctx, spec)):
        columns = column_values(ctx, row, spec)
        start = columns.get("start")
        diagnosis = columns.get("diagnosis")
        if start is None or not diagnosis:
            ctx.warn(
                code="row_dropped",
                section="injuries",
                path="profile.injury_history.entries",
                rule_id="profile.injury_history.entries",
                message="row dropped",
                index=index,
            )
            continue
        end_text = columns.get("end") or ""
        ongoing = casefold_key(str(end_text)) == "actualidad"
        end = None
        if not ongoing and end_text:
            try:
                end = date_dmy(str(end_text))
            except NormaliseError:
                end = None
        entries.append(
            InjuryEntry(
                start=start,
                end=end,
                ongoing=ongoing,
                diagnosis=str(diagnosis),
                duration_days=columns.get("duration"),
            )
        )
    return entries
