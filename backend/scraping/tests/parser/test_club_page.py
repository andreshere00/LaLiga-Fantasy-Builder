# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from lxml.html import fromstring, tostring

from fantasy_scraping.models.page import PageKind, ScrapedPage, Source
from fantasy_scraping.parser.extractors.club_news import parse_club_news
from fantasy_scraping.parser.extractors.club_page import parse_club_page
from fantasy_scraping.parser.models.common import Competition

FIXTURES = Path(__file__).parent / "fixtures" / "futbolfantasy" / "clubs"
FETCHED = datetime(2026, 11, 7, 18, 0, tzinfo=UTC)


def _page(name: str, slug: str, kind: PageKind) -> ScrapedPage:
    return ScrapedPage(
        source=Source.FUTBOLFANTASY,
        kind=kind,
        url=f"https://www.futbolfantasy.com/laliga/equipos/{slug}",
        fetched_at=FETCHED,
        status_code=200,
        html=(FIXTURES / name).read_text(encoding="utf-8"),
        season="2026-27",
        player_slug=slug,
        season_slug="",
    )


# ---- Happy path ---- #


def test_parse_club_page_saved_villarreal_reads_xi_results_and_injuries() -> None:
    page = parse_club_page(_page("villarreal.html", "villarreal", PageKind.CLUB))
    assert page.matchday == 12
    assert page.coach is not None
    assert page.coach.name == "Íñigo Pérez"
    assert page.coach.rotations == "Algunas rotaciones"
    assert page.coach.season_predictability_percent == 79
    assert len(page.starters) == 11
    diatta = next(player for player in page.alternatives if player.name == "Diatta")
    assert diatta.probability == 0
    assert page.summary is not None and page.summary.average_probability == 70
    copa = next(match for match in page.fixtures if match.home == "Manacor")
    assert copa.competition is Competition.COPA_DEL_REY
    assert copa.regulation is not None and copa.regulation.home == 0 and copa.regulation.away == 5
    assert copa.final is None and copa.outcome == "win"
    champions = next(match for match in page.fixtures if match.home == "Liverpool")
    assert champions.competition is Competition.CHAMPIONS_LEAGUE
    assert champions.regulation is not None and champions.regulation.home == 4
    upcoming = next(match for match in page.fixtures if match.scheduled and match.away == "Getafe")
    assert upcoming.kickoff is not None and "08/11" in upcoming.kickoff
    assert upcoming.regulation is None
    assert page.injuries is not None
    injury = next(item for item in page.injuries if item.name == "Alassane Diatta")
    assert injury.status == "Postoperatorio"
    assert injury.started_on is not None and injury.started_on.isoformat() == "2026-10-30"
    assert injury.expected_return == "Baja hasta abril"
    assert injury.diagnosis == "Rotura en los isquiotibiales"
    assert injury.report_url is not None and "/laliga/noticias/" in injury.report_url


def test_parse_club_news_saved_page_returns_every_event_with_kind_and_target() -> None:
    page = _page("villarreal-ultimos-cambios.html", "villarreal", PageKind.CLUB_NEWS)
    page = page.model_copy(
        update={"url": "https://www.futbolfantasy.com/laliga/equipos/villarreal/ultimos-cambios"}
    )
    news = parse_club_news(page)
    assert len(news.items) == 7
    assert news.items[2].title == "Foyth pasa de duda a baja"
    assert [item.kind for item in news.items[:3]] == ["lineup", "lineup", "injury_update"]
    assert [item.target for item in news.items[:3]] == ["club", "club", "article"]
    assert news.items[0].published_at is not None
    assert news.items[0].url.startswith("https://www.futbolfantasy.com/")


def test_parse_club_page_getafe_keeps_treatment_status() -> None:
    page = parse_club_page(_page("getafe.html", "getafe", PageKind.CLUB))
    assert page.coach is not None and page.coach.name == "Pepe Bordalás"
    assert page.injuries is not None
    mayoral = next(item for item in page.injuries if item.name == "Borja Mayoral")
    assert mayoral.status == "Tratamiento"
    conference = next(
        match for match in page.fixtures if match.competition is Competition.CONFERENCE_LEAGUE
    )
    assert conference.competition_label == "Conference League"


# ---- Error paths ---- #


def test_parse_club_page_without_injury_block_marks_injuries_unpublished() -> None:
    scraped = _page("villarreal.html", "villarreal", PageKind.CLUB)
    root = fromstring(scraped.html)
    wrapper = root.cssselect(".lesionados_wrapper")[0]
    wrapper.getparent().remove(wrapper)
    parsed = parse_club_page(
        scraped.model_copy(update={"html": tostring(root, encoding="unicode")})
    )
    assert parsed.injuries is None
    assert parsed.warnings[0].code == "injuries_unpublished"


# ---- Edge cases ---- #


def test_parse_club_page_parenthetical_score_keeps_both_scores() -> None:
    scraped = _page("villarreal.html", "villarreal", PageKind.CLUB)
    root = fromstring(scraped.html)
    scores = root.cssselect("section.ultimos .widget-score")
    scores[0].text = "2 (4)"
    scores[1].text = "2 (5)"
    parsed = parse_club_page(
        scraped.model_copy(update={"html": tostring(root, encoding="unicode")})
    )
    match = parsed.fixtures[0]
    assert match.regulation is not None and (match.regulation.home, match.regulation.away) == (2, 2)
    assert match.final is not None and (match.final.home, match.final.away) == (4, 5)


def test_parse_club_page_missing_expected_return_stays_empty() -> None:
    scraped = _page("villarreal.html", "villarreal", PageKind.CLUB)
    root = fromstring(scraped.html)
    status = root.cssselect("span.rounded-card__status")[0]
    status.getparent().remove(status)
    parsed = parse_club_page(
        scraped.model_copy(update={"html": tostring(root, encoding="unicode")})
    )
    assert parsed.injuries is not None
    assert parsed.injuries[0].expected_return is None
    assert parsed.injuries[1].expected_return is not None
