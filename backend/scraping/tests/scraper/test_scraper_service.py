"""ScraperService orchestration over a fake site."""

import asyncio

import httpx
import pytest
from conftest import HTML, FakeClock, FakeSite

from fantasy_scraping.models.page import PageKind
from fantasy_scraping.scraper.errors import (
    AmbiguousPlayerError,
    InvalidRequestError,
    LinkDataUnavailableError,
    PlayerNotFoundError,
    UnexpectedContentError,
)
from fantasy_scraping.scraper.models import PlayerRef, ScrapeOptions
from fantasy_scraping.scraper.service import ScraperService, current_season

SEASON = "2026-27"

# ---- Happy path ---- #


async def test_get_linked_data_builds_index_once(service: ScraperService, site: FakeSite) -> None:
    first = await service.get_linked_data()
    second = await service.get_linked_data()

    assert "raphinha" in first.player_slugs and "barcelona" in first.team_slugs
    assert first == second
    assert site.count("sitemap-jugadores") == 1


async def test_resolve_player_route_exact_name_returns_explicit_season_url(
    service: ScraperService,
) -> None:
    route = await service.resolve_player_route("Raphinha", season=SEASON)

    assert route.url.endswith("/jugadores/raphinha/laliga-26-27")
    assert route.metric == "exact" and route.team_verified is None


async def test_resolve_player_route_namesake_with_team_reuses_downloaded_page(
    site: FakeSite, make_client, settings, clock
) -> None:
    from fantasy_scraping.scraper.cache import MemoryCache

    site.teams = {"gueye": "getafe", "idrissa-gueye": "getafe", "lamine-gueye": "barcelona"}
    service = ScraperService(make_client(site), MemoryCache(clock), settings, aliases={})

    route = await service.resolve_player_route("Gueye", "Getafe CF", season=SEASON)
    await service.download_player_page(route, SEASON)

    assert route.slug == "gueye" and route.team_verified is True
    assert site.count("/jugadores/gueye/laliga-26-27") == 1


async def test_resolve_player_route_cached_route_skips_index(
    service: ScraperService, site: FakeSite
) -> None:
    await service.resolve_player_route("Raphinha", season=SEASON)
    before = len(site.requests)

    await service.resolve_player_route("Raphinha", season=SEASON)

    assert len(site.requests) == before


async def test_scrape_player_default_returns_profile_only(service: ScraperService) -> None:
    pages = await service.scrape_player("Raphinha", SEASON)

    assert [p.kind for p in pages] == [PageKind.PLAYER]
    assert pages[0].season_slug == "laliga-26-27" and not pages[0].from_cache


async def test_scrape_player_warm_cache_makes_zero_requests(
    service: ScraperService, site: FakeSite
) -> None:
    first = await service.scrape_player("Raphinha", SEASON)
    before = len(site.requests)

    second = await service.scrape_player("Raphinha", SEASON)

    assert len(site.requests) == before
    assert second[0].from_cache and second[0].fetched_at == first[0].fetched_at


async def test_scrape_player_all_kinds_returns_profile_market_and_current_competitions(
    service: ScraperService, site: FakeSite
) -> None:
    include = frozenset(PageKind)

    pages = await service.scrape_player("Raphinha", SEASON, include=include)

    assert [p.kind for p in pages] == [
        PageKind.PLAYER,
        PageKind.MARKET_WIDGET,
        PageKind.COMPETITION,
    ]
    assert pages[2].season_slug == "champions-26-27"
    assert site.count("copa-del-rey") == 0 and site.count("amistoso") == 0
    assert {url.split("/")[2] for url in site.requests} == {"www.futbolfantasy.com"}


async def test_scrape_player_bypass_cache_refetches(
    service: ScraperService, site: FakeSite
) -> None:
    await service.scrape_player("Raphinha", SEASON)

    await service.scrape_player("Raphinha", SEASON, options=ScrapeOptions(bypass_cache=True))

    assert site.count("/jugadores/raphinha/laliga-26-27") == 2


async def test_scrape_player_concurrent_calls_share_one_request(
    service: ScraperService, site: FakeSite
) -> None:
    await asyncio.gather(*(service.scrape_player("Raphinha", SEASON) for _ in range(10)))

    assert site.count("/jugadores/raphinha/laliga-26-27") == 1


async def test_scrape_players_failing_item_does_not_fail_batch(service: ScraperService) -> None:
    refs = [PlayerRef(name="Raphinha"), PlayerRef(name="Zzzz Qqqq"), PlayerRef(name="Gueye")]

    outcomes = await service.scrape_players(refs, SEASON)

    assert outcomes[0].pages and outcomes[0].error is None
    assert outcomes[1].error == {"error": "player_not_found", "detail": "player not found"}
    assert outcomes[2].error and outcomes[2].error["error"] == "player_ambiguous"


async def test_invalidate_slug_drops_only_that_player(
    service: ScraperService, site: FakeSite
) -> None:
    await service.scrape_player("Raphinha", SEASON)

    assert service.invalidate(slug="raphinha") == 1
    await service.scrape_player("Raphinha", SEASON)
    assert site.count("/jugadores/raphinha/laliga-26-27") == 2


def test_current_season_rolls_over_in_july() -> None:
    from datetime import UTC, datetime

    assert current_season(datetime(2026, 10, 4, tzinfo=UTC)) == "2026-27"
    assert current_season(datetime(2027, 3, 1, tzinfo=UTC)) == "2026-27"


# ---- Error paths ---- #


async def test_resolve_player_route_namesake_without_team_raises_ambiguous(
    service: ScraperService,
) -> None:
    with pytest.raises(AmbiguousPlayerError) as info:
        await service.resolve_player_route("Gueye", season=SEASON)

    assert 1 < len(info.value.candidates) <= 5


async def test_resolve_player_route_team_matches_none_raises_ambiguous(
    service: ScraperService,
) -> None:
    with pytest.raises(AmbiguousPlayerError):
        await service.resolve_player_route("Gueye", "Real Sociedad", season=SEASON)


async def test_resolve_player_route_unknown_name_raises_not_found(service: ScraperService) -> None:
    with pytest.raises(PlayerNotFoundError):
        await service.resolve_player_route("Zzzz Qqqq", season=SEASON)


async def test_resolve_player_route_bad_season_raises_invalid(service: ScraperService) -> None:
    with pytest.raises(InvalidRequestError):
        await service.resolve_player_route("Raphinha", season="26-27")


async def test_get_linked_data_upstream_down_without_stale_raises_unavailable(
    service: ScraperService, site: FakeSite
) -> None:
    site.overrides["https://www.futbolfantasy.com/sitemap-jugadores.xml"] = httpx.Response(500)

    with pytest.raises(LinkDataUnavailableError):
        await service.get_linked_data()


async def test_get_linked_data_bad_xml_without_stale_raises_unavailable(
    service: ScraperService, site: FakeSite
) -> None:
    site.overrides["https://www.futbolfantasy.com/sitemap-jugadores.xml"] = httpx.Response(
        200, text="<urlset><loc>", headers={"content-type": "application/xml"}
    )

    with pytest.raises(LinkDataUnavailableError):
        await service.get_linked_data()


async def test_get_linked_data_entity_bomb_is_rejected(
    service: ScraperService, site: FakeSite
) -> None:
    bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><urlset>&a;</urlset>'
    site.overrides["https://www.futbolfantasy.com/sitemap-jugadores.xml"] = httpx.Response(
        200, text=bomb, headers={"content-type": "application/xml"}
    )

    with pytest.raises(LinkDataUnavailableError):
        await service.get_linked_data()


async def test_scrape_player_market_without_widget_id_raises_unexpected(
    service: ScraperService, site: FakeSite
) -> None:
    site.overrides["https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27"] = (
        httpx.Response(200, text="<html><body>no widget</body></html>", headers=HTML)
    )

    with pytest.raises(UnexpectedContentError):
        await service.scrape_player("Raphinha", SEASON, include=frozenset({PageKind.MARKET_WIDGET}))


async def test_scrape_players_over_limit_raises_invalid(service: ScraperService) -> None:
    with pytest.raises(InvalidRequestError):
        await service.scrape_players([PlayerRef(name="Raphinha")] * 26, SEASON)


async def test_download_player_page_competition_without_target_raises_invalid(
    service: ScraperService,
) -> None:
    route = await service.resolve_player_route("Raphinha", season=SEASON)

    with pytest.raises(InvalidRequestError):
        await service.download_player_page(route, SEASON, kind=PageKind.COMPETITION)


# ---- Edge cases ---- #


async def test_get_linked_data_stale_index_served_when_refresh_fails(
    service: ScraperService, site: FakeSite, clock: FakeClock
) -> None:
    first = await service.get_linked_data()
    clock.now += 2 * 86_400
    site.overrides["https://www.futbolfantasy.com/sitemap-jugadores.xml"] = httpx.Response(500)

    assert await service.get_linked_data() == first


async def test_scrape_competition_pages_missing_page_is_skipped(
    service: ScraperService, site: FakeSite
) -> None:
    site.overrides["https://www.futbolfantasy.com/jugadores/raphinha/champions-26-27"] = (
        httpx.Response(404)
    )
    route = await service.resolve_player_route("Raphinha", season=SEASON)

    assert await service.scrape_competition_pages(route, SEASON) == []


async def test_scrape_player_stale_page_served_when_refetch_fails(
    service: ScraperService, site: FakeSite, clock: FakeClock
) -> None:
    await service.scrape_player("Raphinha", SEASON)
    clock.now += 700
    site.overrides["https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27"] = (
        httpx.Response(500)
    )

    pages = await service.scrape_player("Raphinha", SEASON)

    assert pages[0].from_cache
