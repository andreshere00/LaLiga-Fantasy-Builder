"""ScrapingHttpClient status paths, retries and content checks."""

import gzip

import httpx
import pytest
from conftest import HTML, FakeClock, FakeSite

from fantasy_scraping.scraper.errors import (
    CircuitOpenError,
    HostNotAllowedError,
    PlayerNotFoundError,
    RobotsDisallowedError,
    UnexpectedContentError,
    UpstreamBlockedError,
    UpstreamRateLimitedError,
    UpstreamTimeoutError,
    UpstreamUnavailableError,
)
from fantasy_scraping.scraper.settings import ScraperSettings
from fantasy_scraping.scraper.urls import PLAYERS_SITEMAP_URL

URL = "https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27"
SITEMAP_XML = (
    b'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
)

# ---- Mocks, fixtures & helpers ---- #


def _site_with(site: FakeSite, response: httpx.Response) -> FakeSite:
    site.overrides[URL] = response
    return site


# ---- Happy path ---- #


async def test_get_gzip_body_after_stream_decode_returns_text(make_client) -> None:
    site = FakeSite()
    site.overrides[PLAYERS_SITEMAP_URL] = httpx.Response(
        200,
        content=gzip.compress(SITEMAP_XML),
        headers={"content-type": "application/xml", "content-encoding": "gzip"},
    )

    response = await make_client(site).get(
        PLAYERS_SITEMAP_URL, accept=frozenset({"application/xml"}), max_bytes=1024 * 1024
    )

    assert response.text.startswith("<?xml")


async def test_get_ok_returns_text_and_sends_identifiable_user_agent(make_client) -> None:
    seen: list[httpx.Request] = []
    site = FakeSite()

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return site(request)

    response = await make_client(handler).get(URL)

    assert response.status == 200 and "data-jugador" in response.text
    assert "test@example.com" in seen[-1].headers["user-agent"]


async def test_get_redirect_within_host_is_followed(make_client) -> None:
    site = _site_with(
        FakeSite(),
        httpx.Response(302, headers={"location": "/jugadores/raphinha/champions-26-27"}),
    )

    response = await make_client(site).get(URL)

    assert response.url.endswith("champions-26-27")


async def test_get_retryable_status_then_ok_retries_once(make_client) -> None:
    site = FakeSite()
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.startswith("/jugadores/"):
            calls["n"] += 1
            if calls["n"] == 1:
                return httpx.Response(503)
        return site(request)

    assert (await make_client(handler).get(URL)).status == 200
    assert calls["n"] == 2


async def test_get_429_waits_retry_after_then_succeeds(make_client, clock: FakeClock) -> None:
    site = FakeSite()
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.startswith("/jugadores/"):
            calls["n"] += 1
            if calls["n"] == 1:
                return httpx.Response(429, headers={"retry-after": "7"})
        return site(request)

    await make_client(handler).get(URL)

    assert 7 in clock.slept


# ---- Error paths ---- #


async def test_get_404_raises_player_not_found(make_client) -> None:
    with pytest.raises(PlayerNotFoundError):
        await make_client(_site_with(FakeSite(), httpx.Response(404))).get(URL)


async def test_get_403_raises_blocked_without_retry_and_opens_circuit(make_client) -> None:
    site = _site_with(FakeSite(), httpx.Response(403, text="secret upstream body"))
    client = make_client(site)

    with pytest.raises(UpstreamBlockedError) as info:
        await client.get(URL)

    assert "secret" not in str(info.value)
    assert site.count("laliga-26-27") == 1
    with pytest.raises(CircuitOpenError):
        await client.get(URL)


async def test_get_challenge_body_raises_blocked(make_client) -> None:
    html = "<html><title>Just a moment...</title></html>"
    site = _site_with(FakeSite(), httpx.Response(200, text=html, headers=HTML))

    with pytest.raises(UpstreamBlockedError):
        await make_client(site).get(URL)


async def test_get_cf_mitigated_header_raises_blocked(make_client) -> None:
    site = _site_with(
        FakeSite(), httpx.Response(200, text="x", headers={**HTML, "cf-mitigated": "challenge"})
    )

    with pytest.raises(UpstreamBlockedError):
        await make_client(site).get(URL)


async def test_get_second_429_raises_rate_limited(make_client) -> None:
    site = _site_with(FakeSite(), httpx.Response(429))

    with pytest.raises(UpstreamRateLimitedError):
        await make_client(site).get(URL)
    assert site.count("laliga-26-27") == 2


async def test_get_persistent_503_raises_unavailable_after_max_attempts(
    make_client, settings: ScraperSettings
) -> None:
    site = _site_with(FakeSite(), httpx.Response(503))

    with pytest.raises(UpstreamUnavailableError):
        await make_client(site).get(URL)
    assert site.count("laliga-26-27") == settings.max_attempts


async def test_get_timeout_raises_timeout_error(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(UpstreamTimeoutError):
        await make_client(handler).get(URL)


async def test_get_connect_error_raises_unavailable(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        raise httpx.ConnectError("down", request=request)

    with pytest.raises(UpstreamUnavailableError):
        await make_client(handler).get(URL)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json={"a": 1}),
        httpx.Response(200, text="", headers=HTML),
    ],
)
async def test_get_wrong_content_raises_unexpected(make_client, response: httpx.Response) -> None:
    with pytest.raises(UnexpectedContentError):
        await make_client(_site_with(FakeSite(), response)).get(URL)


async def test_get_oversize_body_raises_unexpected(make_client) -> None:
    site = _site_with(FakeSite(), httpx.Response(200, text="x" * 100, headers=HTML))

    with pytest.raises(UnexpectedContentError):
        await make_client(site).get(URL, max_bytes=10)


async def test_get_cross_host_redirect_raises_not_allowed(make_client) -> None:
    site = _site_with(FakeSite(), httpx.Response(302, headers={"location": "https://evil.com/x"}))

    with pytest.raises(HostNotAllowedError):
        await make_client(site).get(URL)


async def test_get_too_many_redirects_raises_unavailable(make_client) -> None:
    site = _site_with(FakeSite(), httpx.Response(302, headers={"location": URL}))

    with pytest.raises(UpstreamUnavailableError):
        await make_client(site).get(URL)


async def test_get_robots_disallow_makes_zero_player_requests(make_client) -> None:
    site = FakeSite()
    site.overrides["https://www.futbolfantasy.com/robots.txt"] = httpx.Response(
        200, text="User-agent: *\nDisallow: /jugadores/\n", headers={"content-type": "text/plain"}
    )

    with pytest.raises(RobotsDisallowedError):
        await make_client(site).get(URL)
    assert site.count("/jugadores/") == 0


async def test_get_disallowed_host_raises_before_any_request(make_client) -> None:
    site = FakeSite()

    with pytest.raises(HostNotAllowedError):
        await make_client(site).get("https://evil.com/jugadores/a/b")
    assert site.requests == []


# ---- Edge cases ---- #


async def test_get_concurrent_calls_never_exceed_host_concurrency(make_client, settings) -> None:
    import asyncio

    site = FakeSite()
    state = {"now": 0, "peak": 0}

    class Transport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            state["now"] += 1
            state["peak"] = max(state["peak"], state["now"])
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            state["now"] -= 1
            return site(request)

    from fantasy_scraping.scraper.http_client import ScrapingHttpClient

    client = ScrapingHttpClient(settings, transport=Transport())
    await asyncio.gather(*(client.get(f"{URL[:-11]}champions-26-27?{i}") for i in range(20)))

    assert state["peak"] <= settings.host_concurrency
