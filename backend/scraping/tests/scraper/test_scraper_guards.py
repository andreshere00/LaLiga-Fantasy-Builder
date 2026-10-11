"""Limiter, breaker, cache, sanitiser, probes, robots and URL guard."""

import random

import pytest
from conftest import FakeClock

from fantasy_scraping.scraper.cache import MemoryCache
from fantasy_scraping.scraper.errors import (
    CircuitOpenError,
    HostNotAllowedError,
    InvalidRequestError,
    RobotsDisallowedError,
    UnexpectedContentError,
    UpstreamBlockedError,
    UpstreamUnavailableError,
)
from fantasy_scraping.scraper.limiter import CircuitBreaker, TokenBucket
from fantasy_scraping.scraper.probes import (
    competition_slugs,
    extract_fragments,
    matching_team_slugs,
    team_matches,
    team_slug,
    widget_id,
)
from fantasy_scraping.scraper.retry import backoff_delay, retry_after
from fantasy_scraping.scraper.robots import RobotsPolicy
from fantasy_scraping.scraper.sanitise import sanitise_html
from fantasy_scraping.scraper.urls import (
    ROBOTS_URL,
    assert_allowed_url,
    check_slug,
    laliga_slug,
    player_url,
    widget_url,
)

# ---- Happy path ---- #


async def test_acquire_burst_exhausted_waits_for_refill(clock: FakeClock) -> None:
    bucket = TokenBucket(rate=2, burst=1, clock=clock)

    await bucket.acquire()
    await bucket.acquire()

    assert clock.now == pytest.approx(0.5)


def test_check_five_failures_opens_then_half_opens_after_cooldown(clock: FakeClock) -> None:
    breaker = CircuitBreaker(clock)
    for _ in range(5):
        breaker.record_failure()

    with pytest.raises(CircuitOpenError):
        breaker.check()
    clock.now += 61
    breaker.check()
    with pytest.raises(CircuitOpenError):
        breaker.check()
    breaker.record_success()
    assert breaker.state == "closed"


def test_get_expired_fresh_window_returns_stale_hit(clock: FakeClock) -> None:
    cache = MemoryCache(clock)
    cache.set("k", "v", ttl_s=10, stale_s=20)

    clock.now = 15
    hit = cache.get("k")

    assert hit is not None and hit.value == "v" and not hit.fresh
    clock.now = 31
    assert cache.get("k") is None


def test_delete_matching_removes_only_matches(clock: FakeClock) -> None:
    cache = MemoryCache(clock)
    cache.set("a:x", 1, 10)
    cache.set("b:y", 2, 10)

    assert cache.delete_matching(lambda k: k.endswith(":x")) == 1
    assert cache.get("b:y") is not None


def test_sanitise_html_csrf_values_blanked_and_idempotent() -> None:
    html = '<meta name="csrf-token" content="SECRET"><input name="_token" value="SECRET">'

    once = sanitise_html(html)

    assert "SECRET" not in once
    assert sanitise_html(once) == once


def test_probes_profile_page_yield_navigation_facts() -> None:
    html = (
        '<a class="club" href="/equipos/barcelona">x</a>'
        '<a class="widget-mercado" href="/analytics/laliga-fantasy/mercado/detalle/4288">'
        '<option value="/jugadores/a/champions-26-27" data-nombre-temporada="2026/27"></option>'
        '<option value="/jugadores/a/amistoso-26-27" data-nombre-temporada="2026/27"></option>'
        '<option value="/jugadores/a/copa-del-rey-25-26" data-nombre-temporada="2025/26"></option>'
    )

    assert team_slug(html) == "barcelona"
    assert widget_id(html) == "4288"
    assert competition_slugs(html, "2026/27") == ["champions-26-27"]


TEAMS = ("barcelona", "getafe", "real-madrid", "atletico-de-madrid")


def test_matching_team_slugs_resolves_one_sitemap_club() -> None:
    assert matching_team_slugs("getafe", TEAMS) == ["getafe"]
    assert matching_team_slugs("fc-barcelona", TEAMS) == ["barcelona"]


def test_matching_team_slugs_ambiguous_short_name_matches_several() -> None:
    assert len(matching_team_slugs("madrid", TEAMS)) > 1


def test_team_matches_requires_unique_sitemap_hit() -> None:
    assert team_matches("getafe", "getafe", TEAMS)
    assert not team_matches("madrid", "real-madrid", TEAMS)


def test_widget_id_link_fallback() -> None:
    html = '<a class="widget-mercado" href="/analytics/laliga-fantasy/mercado/detalle/77?perfil=1">'
    assert widget_id(html) == "77"


def test_widget_id_ignores_unscoped_data_jugador() -> None:
    html = '<div data-jugador="9999"></div>'
    assert widget_id(html) is None


def test_widget_id_script_url_fallback() -> None:
    html = (
        '<section class="mercado">var url = "https://www.futbolfantasy.com/analytics/'
        'laliga-fantasy/mercado/detalle/4288?perfil=1";</section>'
    )

    assert widget_id(html) == "4288"


def test_widget_id_document_script_without_mercado_section() -> None:
    html = (
        "<script>var url = "
        '"https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado/detalle/3693?perfil=1";'
        "</script>"
    )

    assert widget_id(html) == "3693"


def test_widget_id_two_script_ids_returns_none() -> None:
    html = (
        "<script>"
        '"/analytics/laliga-fantasy/mercado/detalle/1"'
        "</script>"
        "<script>"
        '"/analytics/laliga-fantasy/mercado/detalle/2"'
        "</script>"
    )

    assert widget_id(html) is None


def test_team_slug_reads_crest_and_ignores_other_club_links() -> None:
    html = (
        '<a class="team" href="https://www.futbolfantasy.com/laliga/equipos/alaves">nav</a>'
        "<main>"
        '<a href="https://www.futbolfantasy.com/laliga/equipos/real-madrid">news</a>'
        '<div class="img-underphoto">'
        '<a href="https://www.futbolfantasy.com/laliga/equipos/barcelona">'
        '<img alt="Barcelona"></a>'
        "</div>"
        '<a href="https://www.futbolfantasy.com/laliga/equipos/barcelona/jerarquias">j</a>'
        "</main>"
    )

    assert team_slug(html) == "barcelona"


def test_extract_fragments_multiple_returns_all_matches() -> None:
    html = "<div class='x'>1</div><div class='x'>2</div>"

    assert len(extract_fragments(html, {"n": ".x"})["n"]) == 2


def test_extract_fragments_first_only_returns_one() -> None:
    html = "<div class='x'>1</div><div class='x'>2</div>"

    assert len(extract_fragments(html, {"n": ".x"}, multiple=False)["n"]) == 1


def test_extract_fragments_miss_raises_unexpected() -> None:
    with pytest.raises(UnexpectedContentError):
        extract_fragments("<p></p>", {"n": ".missing"})


def test_extract_fragments_bad_css_raises_invalid() -> None:
    with pytest.raises(InvalidRequestError):
        extract_fragments("<p></p>", {"n": "[[["})


def test_urls_builders_use_explicit_season_route() -> None:
    assert laliga_slug("2026-27") == "laliga-26-27"
    assert player_url("raphinha", "laliga-26-27").endswith("/jugadores/raphinha/laliga-26-27")
    assert widget_url("4288").endswith("/detalle/4288?perfil=1")


def test_backoff_delay_is_capped_by_exponent() -> None:
    assert 0 <= backoff_delay(1, random.Random(0)) <= 2


def test_retry_after_is_capped_and_defaults() -> None:
    assert retry_after("500", 10) == 60
    assert retry_after("abc", 10) == 10
    assert retry_after(None, 10) == 10


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "url",
    [
        "http://www.futbolfantasy.com/jugadores/a/b",
        "https://evil.com/jugadores/a/b",
        "https://user@www.futbolfantasy.com/jugadores/a/b",
        "https://www.futbolfantasy.com:8443/jugadores/a/b",
        "https://www.futbolfantasy.com/jugadores/../admin",
        "https://www.futbolfantasy.com/jugadores/a%2Fb",
        "https://www.futbolfantasy.com/admin/",
    ],
)
def test_assert_allowed_url_rejects_unsafe_urls(url: str) -> None:
    with pytest.raises(HostNotAllowedError):
        assert_allowed_url(url)


@pytest.mark.parametrize("slug", ["Raphinha", "a/b", "", "a b", "-a"])
def test_check_slug_invalid_raises(slug: str) -> None:
    with pytest.raises(InvalidRequestError):
        check_slug(slug)


def test_widget_url_non_numeric_raises() -> None:
    with pytest.raises(InvalidRequestError):
        widget_url("12a")


async def test_ensure_allowed_disallow_rule_raises(clock: FakeClock) -> None:
    async def fetch() -> tuple[int, str]:
        return 200, "User-agent: *\nDisallow: /jugadores/\n"

    policy = RobotsPolicy(fetch, "bot", clock)

    with pytest.raises(RobotsDisallowedError):
        await policy.ensure_allowed("https://www.futbolfantasy.com/jugadores/a/b")


async def test_ensure_allowed_robots_5xx_disallows_all(clock: FakeClock) -> None:
    async def fetch() -> tuple[int, str]:
        return 503, ""

    with pytest.raises(RobotsDisallowedError):
        await RobotsPolicy(fetch, "bot", clock).ensure_allowed(
            "https://www.futbolfantasy.com/jugadores/a/b"
        )


async def test_ensure_allowed_robots_403_is_blocked(clock: FakeClock) -> None:
    async def fetch() -> tuple[int, str]:
        return 403, ""

    with pytest.raises(UpstreamBlockedError):
        await RobotsPolicy(fetch, "bot", clock).ensure_allowed(
            "https://www.futbolfantasy.com/jugadores/a/b"
        )


async def test_ensure_allowed_robots_outage_disallows_all(clock: FakeClock) -> None:
    async def fetch() -> tuple[int, str]:
        raise UpstreamUnavailableError()

    with pytest.raises(RobotsDisallowedError):
        await RobotsPolicy(fetch, "bot", clock).ensure_allowed(
            "https://www.futbolfantasy.com/jugadores/a/b"
        )


# ---- Edge cases ---- #


async def test_ensure_allowed_robots_404_allows_and_is_cached(clock: FakeClock) -> None:
    calls: list[int] = []

    async def fetch() -> tuple[int, str]:
        calls.append(1)
        return 404, ""

    policy = RobotsPolicy(fetch, "bot", clock)
    await policy.ensure_allowed("https://www.futbolfantasy.com/jugadores/a/b")
    await policy.ensure_allowed("https://www.futbolfantasy.com/jugadores/a/c")

    assert len(calls) == 1


async def test_ensure_allowed_robots_url_itself_skips_fetch(clock: FakeClock) -> None:
    async def fetch() -> tuple[int, str]:
        raise AssertionError("must not fetch")

    await RobotsPolicy(fetch, "bot", clock).ensure_allowed(ROBOTS_URL)


def test_record_failure_immediate_opens_circuit(clock: FakeClock) -> None:
    breaker = CircuitBreaker(clock)

    breaker.record_failure(immediate=True)

    assert breaker.state == "open"
