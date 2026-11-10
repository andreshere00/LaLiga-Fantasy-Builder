"""Club page extractor for the predicted XI, fixtures, and injuries."""

from __future__ import annotations

import re
from datetime import UTC
from datetime import date as Date

from lxml.html import HtmlElement, fromstring

from fantasy_scraping.models.page import ScrapedPage
from fantasy_scraping.parser.extractors.base import http_url
from fantasy_scraping.parser.models.club_page import (
    ClubCoach,
    ClubFixture,
    ClubInjury,
    ClubOutcome,
    ClubPageDocument,
    ClubRole,
    ClubSquadPlayer,
    ClubXiSummary,
)
from fantasy_scraping.parser.models.common import Competition, PartialParseWarning, Score, warning
from fantasy_scraping.parser.normalise.text import clean_text

_PERCENT = re.compile(r"(\d+)\s*%")
_ARROW = re.compile(r"arrow-(\d+)")
_SINCE = re.compile(r"(\d{1,2})/(\d{1,2})")
_SIDE = re.compile(r"^(\d+)\s*(?:\((\d+)\))?$")
_AVERAGE = re.compile(r"Probabilidad media:\s*(\d+)\s*%")
_RISK = re.compile(r"Riesgo suplencias:\s*(.+)")
_COMPETITIONS: tuple[tuple[str, Competition], ...] = (
    ("champions", Competition.CHAMPIONS_LEAGUE),
    ("europa league", Competition.EUROPA_LEAGUE),
    ("conference", Competition.CONFERENCE_LEAGUE),
    ("copa del rey", Competition.COPA_DEL_REY),
    ("supercopa", Competition.SUPERCOPA),
    ("laliga", Competition.LALIGA),
)
_OUTCOME: dict[str, ClubOutcome] = {
    "won": "win",
    "lost": "loss",
    "draw": "draw",
    "drawn": "draw",
    "empatado": "draw",
}


def parse_club_page(page: ScrapedPage) -> ClubPageDocument:
    """Parse a saved club page.

    Args:
        page: Club HTML. The parser does not fetch.

    Returns:
        Coach, XI, fixtures, and injuries. A missing injury block is ``None``.
    """
    root = fromstring(page.html)
    warnings: list[PartialParseWarning] = []
    matchday = _matchday(root)
    injuries = _injuries(root, page.url, _as_of(page))
    if injuries is None:
        warnings.append(
            warning(
                code="injuries_unpublished",
                section="injuries",
                path="injuries",
                rule_id="club.injuries",
                message="current injuries are not published on this page",
            )
        )
    return ClubPageDocument(
        slug=page.player_slug,
        matchday=matchday,
        coach=_coach(root, page.url, matchday),
        starters=_squad(root, page.url, "jugadores-titulares-", "starter"),
        alternatives=_squad(root, page.url, "jugadores-suplentes-", "alternative"),
        summary=_summary(root),
        fixtures=_fixtures(root, page.url),
        injuries=injuries,
        warnings=warnings,
    )


def _as_of(page: ScrapedPage) -> Date:
    """Return the date the page says its data is as of."""
    fetched = page.fetched_at
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=UTC)
    return fetched.astimezone(UTC).date()


def _matchday(root: HtmlElement) -> int | None:
    """Return the matchday number the page describes."""
    nodes = root.cssselect("h2.lineup-title span.jornada")
    for node in nodes:
        if "jornada_label" in (node.get("class") or ""):
            continue
        text = clean_text("".join(node.itertext()))
        if text.isdigit():
            return int(text)
    return None


def _coach(root: HtmlElement, base: str, matchday: int | None) -> ClubCoach | None:
    """Parse the coach report block."""
    widget = root.cssselect(".entrenador-widget")
    if not widget:
        return None
    box = widget[0]
    names = box.cssselect(".nombre-entrenador")
    name = clean_text("".join(names[0].itertext())) if names else ""
    if not name:
        return None
    photo = box.cssselect(".entrenador img")
    rotations = box.cssselect(".coach-metric--rotations .prevision-wrapper")
    ring = box.cssselect(".coach-ring")
    label = box.cssselect(".coach-season-label")
    return ClubCoach(
        name=name,
        photo_url=_image_url(base, photo[0]) if photo else None,
        matchday=matchday,
        rotations=_plain(rotations),
        matchday_predictability=_matchday_predictability(box),
        season_predictability_percent=_percent_value(_plain(ring) or ""),
        season_predictability_label=_plain(label),
    )


def _matchday_predictability(box: HtmlElement) -> str | None:
    """Return the matchday predictability label of the coach box."""
    for node in box.cssselect(".coach-metric"):
        classes = node.get("class") or ""
        if "coach-metric--rotations" in classes or "coach-metric--season" in classes:
            continue
        label = node.cssselect(".prevision-wrapper")
        text = _plain(label)
        if text:
            return text
    return None


def _squad(root: HtmlElement, base: str, marker: str, role: ClubRole) -> list[ClubSquadPlayer]:
    """Parse the players listed after one marker as starters or alternatives."""
    boxes = [node for node in root.cssselect("div") if marker in (node.get("class") or "")]
    if not boxes:
        return []
    players: list[ClubSquadPlayer] = []
    for node in boxes[0]:
        classes = (node.get("class") or "").split()
        if node.tag != "div" or "camiseta-wrapper" not in classes:
            continue
        once = node.get("data-onceff")
        if role == "starter" and once not in {None, "titular"}:
            continue
        if role == "alternative" and once not in {None, "suplente"}:
            continue
        name = _plain(node.cssselect(".truncate-name"))
        if not name:
            continue
        link = node.cssselect("a.juggador") or node.cssselect("a.camiseta")
        players.append(
            ClubSquadPlayer(
                name=name,
                role=role,
                profile_url=http_url(base, link[0].get("href")) if link else None,
                photo_url=_photo(base, node),
                probability=_widget_percent(node),
                form_arrow=_arrow(node),
                position=node.get("data-posicionlaligafantasy"),
            )
        )
    return players


def _summary(root: HtmlElement) -> ClubXiSummary | None:
    """Parse the published XI averages."""
    blocks = root.cssselect(".alineacion-totales .view.probability")
    if not blocks:
        return None
    text = clean_text("".join(blocks[0].itertext()))
    average = _AVERAGE.search(text)
    risk = _RISK.search(text)
    return ClubXiSummary(
        average_form_arrow=_arrow(blocks[0]),
        average_probability=int(average.group(1)) if average else None,
        substitute_risk=clean_text(risk.group(1)) if risk else None,
    )


def _fixtures(root: HtmlElement, base: str) -> list[ClubFixture]:
    """Parse every fixture card on the page."""
    played = _fixture_cards(root, "section.ultimos", base, scheduled=False)
    upcoming = _fixture_cards(root, "section.proximos", base, scheduled=True)
    return played + upcoming


def _fixture_cards(
    root: HtmlElement, selector: str, base: str, *, scheduled: bool
) -> list[ClubFixture]:
    """Parse the fixture cards matched by one selector."""
    section = root.cssselect(selector)
    if not section:
        return []
    fixtures: list[ClubFixture] = []
    for card in section[0].cssselect("a.partido"):
        home = card.cssselect(".equipo.local img")
        away = card.cssselect(".equipo.visitante img")
        if not home or not away:
            continue
        label = _competition_label(card)
        regulation, final = _scores(card)
        fixtures.append(
            ClubFixture(
                competition=_competition(label),
                competition_label=label,
                home=home[0].get("alt") or "",
                away=away[0].get("alt") or "",
                home_badge=_image_url(base, home[0]),
                away_badge=_image_url(base, away[0]),
                round_label=_plain(card.cssselect(".fase")),
                kickoff=_plain(card.cssselect(".date")),
                regulation=regulation,
                final=final,
                outcome=_outcome(card),
                url=http_url(base, card.get("href")),
                scheduled=scheduled,
            )
        )
    return fixtures


def _competition_label(card: HtmlElement) -> str:
    """Return the competition name printed on a fixture card."""
    images = card.cssselect(".logo img")
    return images[0].get("alt") or "" if images else ""


def _competition(label: str) -> Competition:
    """Map a printed competition name to its competition key."""
    key = clean_text(label).casefold()
    if key in {"laliga", "la liga"}:
        return Competition.LALIGA
    for needle, competition in _COMPETITIONS:
        if needle == "laliga":
            continue
        if needle in key:
            return competition
    return Competition.OTHER


def _scores(card: HtmlElement) -> tuple[Score | None, Score | None]:
    """Parse the regulation and final scores of a fixture card."""
    texts = [clean_text("".join(node.itertext())) for node in card.cssselect(".widget-score")]
    texts = [text for text in texts if text and text != "-"]
    if len(texts) == 4 and all(text.isdigit() for text in texts):
        return Score(home=int(texts[0]), away=int(texts[1])), Score(
            home=int(texts[2]), away=int(texts[3])
        )
    if len(texts) != 2:
        return None, None
    left = _SIDE.fullmatch(texts[0])
    right = _SIDE.fullmatch(texts[1])
    if left is None or right is None:
        return None, None
    regulation = Score(home=int(left.group(1)), away=int(right.group(1)))
    if left.group(2) is None or right.group(2) is None:
        return regulation, None
    return regulation, Score(home=int(left.group(2)), away=int(right.group(2)))


def _outcome(card: HtmlElement) -> ClubOutcome | None:
    """Return the win, draw or loss shown on a fixture card."""
    classes = set((card.get("class") or "").split())
    for token, outcome in _OUTCOME.items():
        if token in classes:
            return outcome
    return None


def _injuries(root: HtmlElement, base: str, today: Date) -> list[ClubInjury] | None:
    """Parse the injury table."""
    wrapper = root.cssselect(".lesionados_wrapper")
    if not wrapper:
        return None
    injuries: list[ClubInjury] = []
    for card in wrapper[0].cssselect("div.elemento.lesionado"):
        link = card.cssselect("a.jugador")
        name = clean_text("".join(link[0].itertext())) if link else ""
        if not name:
            continue
        current = card.cssselect("li.v3-recovery-phase-strip__step.is-current")
        injuries.append(
            ClubInjury(
                name=name,
                profile_url=http_url(base, link[0].get("href")) if link else None,
                photo_url=_photo(base, card),
                diagnosis=_plain(card.cssselect("span.lesion")),
                started_on=_since(_plain(card.cssselect("span.rounded-card__date")) or "", today),
                expected_return=_plain(card.cssselect("span.rounded-card__status")),
                status=_plain(current),
                report_url=_report(base, card),
            )
        )
    return injuries


def _report(base: str, card: HtmlElement) -> str | None:
    """Return the absolute link to an injury report."""
    links = card.cssselect(".links a.lesion")
    return http_url(base, links[0].get("href")) if links else None


def _since(text: str, today: Date) -> Date | None:
    """Parse the date an injury started from its printed text."""
    match = _SINCE.search(text)
    if match is None:
        return None
    day = int(match.group(1))
    month = int(match.group(2))
    try:
        found = Date(today.year, month, day)
    except ValueError:
        return None
    if found > today:
        try:
            return Date(today.year - 1, month, day)
        except ValueError:
            return None
    return found


def _photo(base: str, node: HtmlElement) -> str | None:
    """Return the absolute photo URL inside a node."""
    images = node.cssselect(".fotocontainer img")
    return _image_url(base, images[0]) if images else None


def _image_url(base: str, image: HtmlElement) -> str | None:
    """Return the absolute URL of an image."""
    raw = image.get("data-src") or image.get("src")
    if raw and "transp.png" in raw:
        raw = image.get("data-src") or raw
    return http_url(base, raw)


def _widget_percent(node: HtmlElement) -> int | None:
    """Return the percentage shown by a probability widget."""
    widgets = node.cssselect(".probabilidad-widget")
    if not widgets:
        return None
    return _percent_value(clean_text("".join(widgets[0].itertext())))


def _percent_value(text: str) -> int | None:
    """Parse a 0-100 percentage from text."""
    match = _PERCENT.search(text)
    if match is None:
        return None
    value = int(match.group(1))
    if 0 <= value <= 100:
        return value
    return None


def _arrow(node: HtmlElement) -> int | None:
    """Return the form arrow value of a node."""
    for span in node.cssselect("span.forma"):
        match = _ARROW.search(span.get("class") or "")
        if match is not None:
            return int(match.group(1))
    return None


def _plain(nodes: list[HtmlElement]) -> str | None:
    """Return the cleaned text of the first node, or None when empty."""
    if not nodes:
        return None
    text = clean_text("".join(nodes[0].itertext()))
    return text or None
