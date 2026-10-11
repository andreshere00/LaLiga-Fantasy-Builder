"""Recent and upcoming widgets."""

import re
from dataclasses import dataclass

from lxml.html import HtmlElement

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError, ParserSectionError
from fantasy_scraping.parser.extractors.base import ExtractionContext, rows_with_dates
from fantasy_scraping.parser.models.common import Competition, MinutesNote, Score
from fantasy_scraping.parser.models.futbolfantasy import (
    MatchesBlock,
    PlayerSide,
    RecentMatch,
    UpcomingMatch,
)
from fantasy_scraping.parser.normalise.dates import day_month, resolve_sequence
from fantasy_scraping.parser.normalise.minutes import minutes_note
from fantasy_scraping.parser.normalise.numbers import es_int
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text

_SCORE = re.compile(r"(\d+)\s*[-–−]\s*(\d+)")
_TOOLTIP = re.compile(r"^(.+?)\s+(\d+)\s*[-–−]\s*(\d+)\s+(.+)$")
_KICKOFF = re.compile(r"(\d{1,2}:\d{2})")


@dataclass(frozen=True, slots=True)
class CalendarDayMeta:
    """Teams, competition and home/away side from one calendar day cell."""

    competition: Competition
    competition_raw: str | None
    home_team: str | None
    away_team: str | None
    opponent: str | None
    is_home: bool | None


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
    for day in _days_for_header(root, "Últimos 5", limit=5):
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
        meta = _calendar_day_meta(ctx, day)
        side: PlayerSide | None = None
        if meta.is_home is True:
            side = "home"
        elif meta.is_home is False:
            side = "away"
        matches.append(
            RecentMatch(
                date=resolved[index],
                matchday=_calendar_matchday(day),
                competition=meta.competition,
                competition_raw=meta.competition_raw,
                home_team=meta.home_team,
                away_team=meta.away_team,
                opponent=meta.opponent,
                score=score,
                player_side=side,
                minutes=note if note.raw else MinutesNote(raw="", event="unknown"),
            )
        )
    return matches


def _upcoming_calendar(ctx: ExtractionContext) -> list[UpcomingMatch]:
    days = _days_for_header(ctx.document.root, "Próximos 5", limit=5)
    if not days:
        ctx.miss("matches.upcoming")
        return []
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
        meta = _calendar_day_meta(ctx, day)
        matches.append(
            UpcomingMatch(
                date=resolved[index],
                matchday=_calendar_matchday(day),
                kickoff=_calendar_kickoff(day),
                is_home=meta.is_home,
                competition=meta.competition,
                competition_raw=meta.competition_raw,
                home_team=meta.home_team,
                away_team=meta.away_team,
                opponent=meta.opponent,
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
    found = _KICKOFF.search(text)
    return found.group(1) if found else None


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


def _calendar_day_meta(ctx: ExtractionContext, day: HtmlElement) -> CalendarDayMeta:
    """Read competition, teams and side from one calendar day cell."""
    competition_raw = _calendar_competition_raw(day)
    competition = _calendar_competition(ctx, day)
    opponent = _calendar_rival(day)
    home_team, away_team, is_home = _calendar_teams(day, opponent)
    explicit = _calendar_home(day)
    if explicit is not None:
        is_home = explicit
    return CalendarDayMeta(
        competition=competition,
        competition_raw=competition_raw,
        home_team=home_team,
        away_team=away_team,
        opponent=opponent,
        is_home=is_home,
    )


def _calendar_rival(day: HtmlElement) -> str | None:
    node = day.cssselect("img.m-rival, img.rival-widget")
    if not node:
        return None
    alt = clean_text(node[0].get("alt") or "")
    return alt or None


def _calendar_teams(
    day: HtmlElement,
    opponent: str | None,
) -> tuple[str | None, str | None, bool | None]:
    anchor = day.cssselect("a[data-tooltip], a[href*='/partidos/']")
    tooltip = anchor[0].get("data-tooltip") if anchor else None
    if isinstance(tooltip, str) and tooltip.strip():
        parsed = _parse_tooltip(tooltip)
        if parsed is not None:
            home_name, _, _, away_name = parsed
            is_home = None
            if opponent:
                key = casefold_key(opponent)
                if key == casefold_key(away_name):
                    is_home = True
                elif key == casefold_key(home_name):
                    is_home = False
            return home_name, away_name, is_home
    return None, None, None


def _days_for_header(root: HtmlElement, header_text: str, *, limit: int) -> list[HtmlElement]:
    """Return ``.day`` cells under the widget that follows ``header_text``."""
    headers = root.xpath(f"//header[contains(normalize-space(.), '{header_text}')]")
    for header in headers:
        row = header.getparent()
        if row is None:
            continue
        days = row.cssselect(".day")
        if days:
            return days[:limit]
        calendar = header.xpath("following-sibling::div[contains(@class, 'calendar')][1]")
        if calendar:
            days = calendar[0].cssselect(".day")
            if days:
                return days[:limit]
    return []


def _parse_tooltip(text: str) -> tuple[str, int, int, str] | None:
    match = _TOOLTIP.match(clean_text(text))
    if match is None:
        return None
    return (
        match.group(1).strip(),
        int(match.group(2)),
        int(match.group(3)),
        match.group(4).strip(),
    )


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
