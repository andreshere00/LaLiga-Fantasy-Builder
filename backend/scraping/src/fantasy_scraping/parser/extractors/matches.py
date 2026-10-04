"""Recent and upcoming widgets."""

import re

from lxml.html import HtmlElement

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError, ParserSectionError
from fantasy_scraping.parser.extractors.base import ExtractionContext, rows_with_dates
from fantasy_scraping.parser.models.common import Competition, MinutesNote, Score
from fantasy_scraping.parser.models.futbolfantasy import MatchesBlock, RecentMatch, UpcomingMatch
from fantasy_scraping.parser.normalise.dates import day_month, resolve_sequence
from fantasy_scraping.parser.normalise.minutes import minutes_note
from fantasy_scraping.parser.normalise.numbers import es_int
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text

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
    list_root = ctx.document.first("ul.ultimos")
    calendar_root = ctx.document.first("#profile-partidos")
    if list_root is None and calendar_root is None:
        raise ParserSectionError(
            "required_anchor_missing",
            "recent matches missing",
            section="matches.recent",
        )
    if list_root is not None:
        recent = _recent(ctx)
        upcoming = _upcoming(ctx)
    else:
        recent = _recent_calendar(ctx, calendar_root)
        upcoming = _upcoming_calendar(ctx)
    return MatchesBlock(recent=recent, upcoming=upcoming)


def _recent_calendar(ctx: ExtractionContext, root: HtmlElement) -> list[RecentMatch]:
    pending: list[tuple[HtmlElement, tuple[int, int]]] = []
    for day in root.cssselect(".day"):
        raw_date = _calendar_date(day)
        if raw_date is None:
            continue
        try:
            pending.append((day, day_month(raw_date)))
        except NormaliseError:
            continue
    pairs = [item[1] for item in pending]
    resolved = resolve_sequence(pairs, ctx.page.fetched_at, "recent") if pairs else []
    matches: list[RecentMatch] = []
    for index, (day, _) in enumerate(pending):
        if index >= len(resolved):
            break
        score = _score(_calendar_score(day))
        note = minutes_note(_calendar_minutes(day), starter=False)
        matches.append(
            RecentMatch(
                date=resolved[index],
                matchday=_calendar_matchday(day),
                score=score,
                minutes=note if note.raw else MinutesNote(raw="", event="unknown"),
            )
        )
    return matches


def _upcoming_calendar(ctx: ExtractionContext) -> list[UpcomingMatch]:
    header = ctx.document.root.xpath(
        "//header[contains(normalize-space(.), 'Pr\u00f3ximos 5')]"
        "/following-sibling::div[contains(@class, 'calendar')][1]"
    )
    if not header:
        ctx.miss("matches.upcoming")
        return []
    days = header[0].cssselect(".day")
    pending: list[HtmlElement] = []
    pairs: list[tuple[int, int]] = []
    for day in days:
        raw_date = _calendar_date(day)
        if raw_date is None:
            continue
        try:
            pairs.append(day_month(raw_date))
            pending.append(day)
        except NormaliseError:
            continue
    resolved = resolve_sequence(pairs, ctx.page.fetched_at, "upcoming") if pairs else []
    matches: list[UpcomingMatch] = []
    for index, day in enumerate(pending):
        if index >= len(resolved):
            break
        matches.append(
            UpcomingMatch(
                date=resolved[index],
                matchday=_calendar_matchday(day),
                kickoff=_calendar_kickoff(day),
                is_home=_calendar_home(day),
                competition=_calendar_competition(ctx, day),
                competition_raw=_calendar_competition_raw(day),
            )
        )
    return matches


def _calendar_date(day: HtmlElement) -> str | None:
    node = day.cssselect("span.number")
    if not node:
        return None
    text = clean_text(node[0].text or "")
    return text or None


def _calendar_score(day: HtmlElement) -> str:
    for selector in (".resultado", ".resultadoWid"):
        node = day.cssselect(selector)
        if node:
            return clean_text(node[0].text or "")
    return ""


def _calendar_minutes(day: HtmlElement) -> str:
    for node in day.cssselect("span.fecha span"):
        text = clean_text(node.text or "")
        if text:
            return text
    return (
        clean_text(node_text(day.cssselect("span.fecha")[0])) if day.cssselect("span.fecha") else ""
    )


def _calendar_matchday(day: HtmlElement) -> int | None:
    node = day.cssselect(".j b")
    if not node:
        return None
    raw = clean_text(node[0].text or "").removeprefix("J").removeprefix("j")
    try:
        return es_int(raw)
    except NormaliseError:
        return None


def _calendar_kickoff(day: HtmlElement) -> str | None:
    text = node_text(day.cssselect("span.fecha")[0]) if day.cssselect("span.fecha") else ""
    found = re.search(r"(\d{1,2}:\d{2})h?", text)
    return f"{found.group(1)}h" if found else None


def _calendar_home(day: HtmlElement) -> bool | None:
    if day.cssselect("span.fecha span.home"):
        return True
    if day.cssselect("span.fecha img[alt='Fuera']"):
        return False
    return None


def _calendar_competition_raw(day: HtmlElement) -> str | None:
    node = day.cssselect(".widget-partidos-min img")
    if not node:
        return None
    return node[0].get("alt")


def _calendar_competition(ctx: ExtractionContext, day: HtmlElement) -> Competition:
    raw = _calendar_competition_raw(day)
    if raw is None:
        return Competition.OTHER
    mapped = _from_label(ctx, raw)
    return mapped if mapped is not None else Competition.OTHER


def _recent(ctx: ExtractionContext) -> list[RecentMatch]:
    dated = rows_with_dates(ctx, ctx.table("recent"), section="matches.recent", direction="recent")
    matches: list[RecentMatch] = []
    for index, (_, columns, when) in enumerate(dated):
        if when is None:
            continue
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
    dated = rows_with_dates(
        ctx, ctx.table("upcoming"), section="matches.upcoming", direction="upcoming"
    )
    partidos = _partidos(ctx)
    matches: list[UpcomingMatch] = []
    for _, columns, when in dated:
        if when is None:
            continue
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
