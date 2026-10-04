"""Recent and upcoming widgets."""

import re

from fantasy_scraping.parser.errors import NormaliseError, ParserSectionError
from fantasy_scraping.parser.extractors.base import ExtractionContext, column_values, rows_of
from fantasy_scraping.parser.models.common import Competition, MinutesNote, Score
from fantasy_scraping.parser.models.futbolfantasy import MatchesBlock, RecentMatch, UpcomingMatch
from fantasy_scraping.parser.normalise.dates import day_month, resolve_sequence
from fantasy_scraping.parser.normalise.minutes import minutes_note
from fantasy_scraping.parser.normalise.text import casefold_key

_SCORE = re.compile(r"(\d+)\s*[-–−]\s*(\d+)")


def extract_matches(ctx: ExtractionContext) -> MatchesBlock:
    """Read the last-five and next-five widgets.

    Args:
        ctx: Extraction context.

    Returns:
        Both lists in page order.

    Raises:
        ParserSectionError: The recent-match container is missing.
    """
    if ctx.document.first(ctx.selector("recent_root")) is None:
        raise ParserSectionError(
            "required_anchor_missing",
            "recent matches missing",
            section="matches.recent",
        )
    recent = _recent(ctx)
    upcoming = _upcoming(ctx)
    return MatchesBlock(recent=recent, upcoming=upcoming)


def _recent(ctx: ExtractionContext) -> list[RecentMatch]:
    spec = ctx.table("recent")
    raw_rows = rows_of(ctx, spec)
    parsed: list[tuple[object, dict[str, object]]] = []
    pairs: list[tuple[int, int]] = []
    for index, row in enumerate(raw_rows):
        columns = column_values(ctx, row, spec)
        raw_date = columns.get("date")
        if not isinstance(raw_date, str):
            ctx.warn(
                code="row_dropped",
                section="matches.recent",
                path="matches.recent",
                rule_id="matches.recent",
                message="row dropped",
                index=index,
            )
            continue
        try:
            pairs.append(day_month(raw_date))
        except NormaliseError:
            ctx.warn(
                code="row_dropped",
                section="matches.recent",
                path="matches.recent",
                rule_id="matches.recent",
                message="row dropped",
                index=index,
            )
            continue
        parsed.append((row, columns))
    dates = resolve_sequence(pairs, ctx.page.fetched_at, "recent") if pairs else []
    matches: list[RecentMatch] = []
    for index, ((row, columns), when) in enumerate(zip(parsed, dates, strict=True)):
        score = _score(str(columns.get("score") or ""))
        raw_minutes = str(columns.get("minutes") or "")
        note = minutes_note(raw_minutes, starter=False)
        if note.event == "subbed_off" and note.minutes is None:
            ctx.warn(
                code="minutes_assumed_unknown",
                section="matches.recent",
                path="matches.recent.minutes",
                rule_id="matches.recent.minutes",
                message="minutes need a starter flag",
                index=index,
            )
        _ = row
        matches.append(
            RecentMatch(
                date=when,
                matchday=(
                    columns.get("matchday") if isinstance(columns.get("matchday"), int) else None
                ),
                score=score,
                minutes=note if note.raw else MinutesNote(raw="", event="unknown"),
            )
        )
    return matches


def _upcoming(ctx: ExtractionContext) -> list[UpcomingMatch]:
    if ctx.document.first(ctx.selector("upcoming_root")) is None:
        ctx.miss("matches.upcoming")
        ctx.warn(
            code="field_missing",
            section="matches.upcoming",
            path="matches.upcoming",
            rule_id="matches.upcoming",
            message="expected field missing",
        )
        return []
    spec = ctx.table("upcoming")
    kept: list[dict[str, object]] = []
    pairs: list[tuple[int, int]] = []
    for index, row in enumerate(rows_of(ctx, spec)):
        columns = column_values(ctx, row, spec)
        raw_date = columns.get("date")
        if not isinstance(raw_date, str):
            ctx.warn(
                code="row_dropped",
                section="matches.upcoming",
                path="matches.upcoming",
                rule_id="matches.upcoming",
                message="row dropped",
                index=index,
            )
            continue
        try:
            pairs.append(day_month(raw_date))
        except NormaliseError:
            ctx.warn(
                code="row_dropped",
                section="matches.upcoming",
                path="matches.upcoming",
                rule_id="matches.upcoming",
                message="row dropped",
                index=index,
            )
            continue
        kept.append(columns)
    dates = resolve_sequence(pairs, ctx.page.fetched_at, "upcoming") if pairs else []
    partidos = _partidos(ctx)
    matches: list[UpcomingMatch] = []
    for when, columns in zip(dates, kept, strict=True):
        kickoff = columns.get("kickoff") if isinstance(columns.get("kickoff"), str) else None
        competition, raw = _competition_for(ctx, when, kickoff, partidos)
        matches.append(
            UpcomingMatch(
                date=when,
                matchday=(
                    columns.get("matchday") if isinstance(columns.get("matchday"), int) else None
                ),
                kickoff=kickoff,
                is_home=_home_flag(columns.get("home")),
                competition=competition,
                competition_raw=raw,
            )
        )
    return matches


def _score(value: str) -> Score | None:
    match = _SCORE.search(value)
    if match is None:
        return None
    return Score(home=int(match.group(1)), away=int(match.group(2)))


def _home_flag(value: object) -> bool | None:
    if not isinstance(value, str) or not value.strip() or value.strip() in {"—", "-"}:
        return None
    key = casefold_key(value)
    if key in {"si", "sí", "local", "casa"}:
        return True
    if key in {"no", "visitante", "fuera"}:
        return False
    return None


def _partidos(ctx: ExtractionContext) -> list[tuple[tuple[int, int], str | None, str | None]]:
    found: list[tuple[tuple[int, int], str | None, str | None]] = []
    for node in ctx.document.css(ctx.selector("partido")):
        raw_date = node.get("data-date") or ""
        try:
            pair = day_month(raw_date)
        except NormaliseError:
            continue
        images = node.cssselect("img")
        alt = images[0].get("alt") if images else None
        found.append((pair, node.get("data-time"), alt))
    return found


def _competition_for(
    ctx: ExtractionContext,
    when: object,
    kickoff: str | None,
    partidos: list[tuple[tuple[int, int], str | None, str | None]],
) -> tuple[Competition, str | None]:
    from datetime import date

    if not isinstance(when, date):
        return Competition.OTHER, None
    for pair, time_text, alt in partidos:
        if pair != (when.day, when.month):
            continue
        if kickoff and time_text and time_text[:5] != kickoff:
            continue
        competition = _from_label(ctx, alt or "")
        if competition is None:
            ctx.warn(
                code="competition_unresolved",
                section="matches.upcoming",
                path="matches.upcoming.competition",
                rule_id="matches.upcoming.competition",
                message="competition was not resolved",
                preview=alt,
            )
            return Competition.OTHER, alt
        return competition, alt
    ctx.warn(
        code="competition_unresolved",
        section="matches.upcoming",
        path="matches.upcoming.competition",
        rule_id="matches.upcoming.competition",
        message="competition was not resolved",
    )
    return Competition.OTHER, None


def _from_label(ctx: ExtractionContext, label: str) -> Competition | None:
    key = casefold_key(label)
    if not key:
        return None
    for alias in ctx.rules.competitions:
        if key == casefold_key(alias.label) or key.startswith(alias.prefix.casefold()):
            return Competition(alias.competition)
    return None


def competition_from_slug(ctx: ExtractionContext, slug: str) -> Competition:
    """Map a season slug such as ``champions-26-27`` to a competition."""
    token = slug.casefold()
    for alias in ctx.rules.competitions:
        if token.startswith(alias.prefix.casefold()):
            return Competition(alias.competition)
    return Competition.OTHER
