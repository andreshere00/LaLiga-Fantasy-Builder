"""Markdown section renderers with empty and partial models."""

from support import page

from fantasy_scraping.models.page import PageKind
from fantasy_scraping.parser.markdown import sections
from fantasy_scraping.parser.markdown.options import RenderOptions
from fantasy_scraping.parser.merge import merge_competitions
from fantasy_scraping.parser.models.common import PartialParseWarning
from fantasy_scraping.parser.models.futbolfantasy import FutbolFantasyPlayer
from fantasy_scraping.parser.rules.loader import RuleRepository
from fantasy_scraping.parser.service import ParserService

# ---- Mocks, fixtures & helpers ---- #

SERVICE = ParserService()
RULES = RuleRepository().load()
EMPTY_OPTS = RenderOptions(include_empty_sections=True, include_static_blocks=True)
HIDE_STATIC = RenderOptions(include_empty_sections=True, include_static_blocks=False)


def _stripped(player: FutbolFantasyPlayer) -> FutbolFantasyPlayer:
    profile = player.profile.model_copy(
        update={
            "availability": None,
            "form": None,
            "start_probability": None,
            "injury_risk": None,
            "hierarchy": None,
            "injury": None,
            "max_profitable_bid": None,
            "personal": None,
            "position": None,
            "platform_roles": [],
            "injury_history": None,
            "news": [],
        }
    )
    return player.model_copy(
        update={
            "profile": profile,
            "market": None,
            "season_stats": None,
            "fantasy_points": None,
            "fixtures": [],
            "matches": player.matches.model_copy(update={"recent": [], "upcoming": []}),
        }
    )


# ---- Happy path ---- #


def test_section_renderers_cover_empty_and_static_paths() -> None:
    full = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    assert sections.render_status(full, RenderOptions())
    assert sections.render_personal(full, RenderOptions())
    assert sections.render_position(full, RenderOptions())
    assert sections.render_injuries(full, RenderOptions())
    assert sections.render_market(full, RenderOptions())
    assert sections.render_season(full, RenderOptions())
    assert sections.render_points(full, RULES, RenderOptions())
    assert sections.render_fixtures(full, RULES, RenderOptions())
    assert sections.render_news(full)
    bare = _stripped(full)
    assert sections.render_title(bare, RULES)
    assert sections.render_meta(bare, RULES)
    assert sections.render_identity(bare)
    assert sections.render_status(bare, EMPTY_OPTS)
    assert sections.render_personal(bare, EMPTY_OPTS)
    assert sections.render_position(bare, EMPTY_OPTS)
    assert sections.render_injuries(bare, EMPTY_OPTS)
    assert sections.render_calendar(bare)
    assert sections.render_market(bare, EMPTY_OPTS)
    assert sections.render_news(bare) == []
    assert sections.render_season(bare, EMPTY_OPTS)
    assert sections.render_points(bare, RULES, EMPTY_OPTS)
    assert sections.render_fixtures(bare, RULES, EMPTY_OPTS)
    assert sections.render_static(bare, RULES, EMPTY_OPTS)
    assert sections.render_static(bare, RULES, HIDE_STATIC) == []
    text = SERVICE.to_markdown(bare, EMPTY_OPTS)
    assert "## Información personal" in text
    assert "## Partidos LaLiga — tabla principal" in text


def test_merge_competitions_warns_when_competition_page_missing() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    merged = merge_competitions([player])
    assert any(item.code == "competition_page_missing" for item in merged.warnings)
    assert merged.fixtures[0].stats is not None


def test_merge_competitions_keeps_upcoming_competition_unresolved() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    upcoming_warn = PartialParseWarning(
        code="competition_unresolved",
        section="matches.upcoming",
        path="matches.upcoming.competition",
        rule_id="matches.upcoming.competition",
        message="competition was not resolved",
        index=0,
    )
    player = player.model_copy(update={"warnings": [*player.warnings, upcoming_warn]})
    merged = merge_competitions([player])
    assert any(
        item.code == "competition_unresolved" and item.section == "matches.upcoming"
        for item in merged.warnings
    )


def test_merge_competitions_ambiguous_join_warns_without_page_missing() -> None:
    body = page("raphinha_champions_26_27.html").html
    laliga = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    champions = SERVICE.parse_futbolfantasy(
        page(
            "raphinha_champions_26_27.html",
            season_slug="champions-26-27",
            kind=PageKind.COMPETITION,
        )
    )
    europa = SERVICE.parse_futbolfantasy(
        page(
            "raphinha_champions_26_27.html",
            html=body,
            season_slug="europa-league-26-27",
            kind=PageKind.COMPETITION,
            url="https://www.futbolfantasy.com/jugadores/raphinha/europa-league-26-27",
        )
    )
    merged = merge_competitions([laliga, champions, europa])
    codes = [item.code for item in merged.warnings if item.section == "matches.recent"]
    assert "competition_join_ambiguous" in codes
    assert "competition_page_missing" not in codes


def test_merge_competitions_uses_first_page_when_no_laliga_slug() -> None:
    copa = SERVICE.parse_futbolfantasy(
        page(
            "raphinha_copa_25_26.html",
            season="2025-26",
            season_slug="copa-del-rey-25-26",
            kind=PageKind.COMPETITION,
        )
    )
    merged = merge_competitions([copa])
    assert merged.meta.season_url == "copa-del-rey-25-26"
