"""The only module that imports httpx: guard, robots, limits, retries and size checks."""

import asyncio
import random
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx

from fantasy_scraping.scraper.clock import Clock, SystemClock
from fantasy_scraping.scraper.errors import (
    PlayerNotFoundError,
    ScrapingError,
    UnexpectedContentError,
    UpstreamBlockedError,
    UpstreamRateLimitedError,
    UpstreamTimeoutError,
    UpstreamUnavailableError,
)
from fantasy_scraping.scraper.limiter import CircuitBreaker, TokenBucket
from fantasy_scraping.scraper.retry import (
    DEFAULT_429_WAIT_S,
    RETRYABLE_STATUSES,
    backoff_delay,
    retry_after,
)
from fantasy_scraping.scraper.robots import RobotsPolicy
from fantasy_scraping.scraper.settings import ScraperSettings
from fantasy_scraping.scraper.urls import ROBOTS_URL, assert_allowed_url

HTML_TYPES: frozenset[str] = frozenset({"text/html", "application/xhtml+xml"})
XML_TYPES: frozenset[str] = frozenset({"text/xml", "application/xml"})
CHALLENGE_MARKERS: tuple[str, ...] = ("just a moment...", "cf-chl-")
_STRIPPED_RESPONSE_HEADERS: frozenset[str] = frozenset(
    {"content-encoding", "content-length", "transfer-encoding"}
)
COUNTED_FAILURES: tuple[type[ScrapingError], ...] = (
    UpstreamBlockedError,
    UpstreamRateLimitedError,
    UpstreamTimeoutError,
    UpstreamUnavailableError,
)


@dataclass(frozen=True, slots=True)
class HttpResponse:
    """A validated response.

    Attributes:
        url: Final URL after redirects.
        status: HTTP status.
        text: Decoded body.
        content_type: Media type without parameters.
        etag: ``ETag`` header when present.
    """

    url: str
    status: int
    text: str
    content_type: str
    etag: str | None = None


class ScrapingHttpClient:
    """Shared cookieless async client for FutbolFantasy."""

    def __init__(
        self,
        settings: ScraperSettings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock | None = None,
        rng: random.Random | None = None,
    ) -> None:
        """Build the client and its guards.

        Args:
            settings: Scraper settings.
            transport: Optional transport, used by tests.
            clock: Optional time source.
            rng: Optional random source for jitter and backoff.
        """
        self._settings: ScraperSettings = settings
        self._clock: Clock = clock or SystemClock()
        self._rng: random.Random = rng or random.Random()
        timeout = httpx.Timeout(
            settings.timeout_ms / 1000, connect=min(5.0, settings.timeout_ms / 1000), pool=5.0
        )
        self._http: httpx.AsyncClient = httpx.AsyncClient(
            transport=transport,
            timeout=timeout,
            follow_redirects=False,
            headers={
                "User-Agent": settings.effective_user_agent,
                "Accept-Language": "es-ES,es;q=0.9",
            },
        )
        self._bucket: TokenBucket = TokenBucket(settings.rate_per_s, settings.burst, self._clock)
        self._breaker: CircuitBreaker = CircuitBreaker(self._clock)
        self._global: asyncio.Semaphore = asyncio.Semaphore(settings.global_concurrency)
        self._host: asyncio.Semaphore = asyncio.Semaphore(settings.host_concurrency)
        self._robots: RobotsPolicy = RobotsPolicy(
            self._fetch_robots, settings.effective_user_agent, self._clock
        )

    @property
    def breaker_state(self) -> str:
        """Return the host circuit state."""
        return self._breaker.state

    async def get(
        self, url: str, *, accept: frozenset[str] = HTML_TYPES, max_bytes: int | None = None
    ) -> HttpResponse:
        """Fetch one allow-listed URL.

        Args:
            url: Absolute URL built by ``urls.py``.
            accept: Allowed media types of a 200 response.
            max_bytes: Decoded body cap. Defaults to the page cap.

        Returns:
            The validated 200 response.

        Raises:
            HostNotAllowedError: The URL or a redirect target is not allow-listed.
            RobotsDisallowedError: robots.txt forbids the path.
            PlayerNotFoundError: Upstream answered 404.
            UpstreamBlockedError: 403, a challenge page, or an open circuit trigger.
            UpstreamRateLimitedError: Repeated 429.
            UpstreamTimeoutError: Every attempt timed out.
            UpstreamUnavailableError: 5xx, connect errors or other 4xx.
            UnexpectedContentError: Wrong content type, empty or oversize body.
            CircuitOpenError: The host circuit is open.
        """
        assert_allowed_url(url)
        await self._robots.ensure_allowed(url)
        return await self._guarded(url, accept, max_bytes or self._settings.max_body_bytes, False)

    async def aclose(self) -> None:
        """Close the underlying connection pool."""
        await self._http.aclose()

    async def _fetch_robots(self) -> tuple[int, str]:
        """Fetch robots.txt, tolerating 4xx answers."""
        response = await self._guarded(ROBOTS_URL, frozenset({"text/plain"}), 512 * 1024, True)
        return response.status, response.text

    async def _guarded(
        self, url: str, accept: frozenset[str], max_bytes: int, tolerate_missing: bool
    ) -> HttpResponse:
        """Apply breaker and concurrency limits around the retry loop."""
        self._breaker.check()
        async with self._global, self._host:
            try:
                response = await self._with_retries(url, accept, max_bytes, tolerate_missing)
            except COUNTED_FAILURES as exc:
                self._breaker.record_failure(immediate=isinstance(exc, UpstreamBlockedError))
                raise
            except (PlayerNotFoundError, UnexpectedContentError):
                self._breaker.record_success()
                raise
        self._breaker.record_success()
        return response

    async def _with_retries(
        self, url: str, accept: frozenset[str], max_bytes: int, tolerate_missing: bool
    ) -> HttpResponse:
        """Retry transient failures with jittered backoff."""
        last: ScrapingError = UpstreamUnavailableError()
        rate_limited = False
        for attempt in range(self._settings.max_attempts):
            await self._bucket.acquire()
            low, high = self._settings.jitter_ms
            await self._clock.sleep(self._rng.uniform(low, high) / 1000)
            try:
                response = await self._request(url, max_bytes)
            except httpx.TimeoutException:
                last = UpstreamTimeoutError()
            except httpx.TransportError:
                last = UpstreamUnavailableError()
            else:
                status = response.status_code
                if status == 429:
                    if rate_limited:
                        raise UpstreamRateLimitedError()
                    rate_limited = True
                    wait = retry_after(response.headers.get("retry-after"), DEFAULT_429_WAIT_S)
                    await self._clock.sleep(wait)
                    last = UpstreamRateLimitedError()
                    continue
                if status not in RETRYABLE_STATUSES:
                    return self._accept(response, accept, tolerate_missing)
                last = UpstreamUnavailableError()
            await self._clock.sleep(backoff_delay(attempt, self._rng))
        raise last

    @staticmethod
    def _plain_body_headers(headers: httpx.Headers) -> httpx.Headers:
        """Drop encoding headers after ``aiter_bytes`` has already decoded the body."""
        return httpx.Headers(
            {k: v for k, v in headers.items() if k.lower() not in _STRIPPED_RESPONSE_HEADERS}
        )

    async def _request(self, url: str, max_bytes: int) -> httpx.Response:
        """Follow redirects manually, re-validating every hop, and read a capped body."""
        current = url
        for _ in range(self._settings.max_redirects + 1):
            assert_allowed_url(current)
            async with self._http.stream("GET", current) as streamed:
                self._http.cookies.clear()
                location = streamed.headers.get("location")
                if streamed.is_redirect and location:
                    current = urljoin(current, location)
                    continue
                body = bytearray()
                if streamed.status_code == 200:
                    async for chunk in streamed.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > max_bytes:
                            raise UnexpectedContentError()
                return httpx.Response(
                    streamed.status_code,
                    headers=self._plain_body_headers(streamed.headers),
                    content=bytes(body),
                    request=streamed.request,
                )
        raise UpstreamUnavailableError()

    @staticmethod
    def _accept(
        response: httpx.Response, accept: frozenset[str], tolerate_missing: bool
    ) -> HttpResponse:
        """Map a final response to a validated result or a typed error."""
        status = response.status_code
        if status == 403 or response.headers.get("cf-mitigated") == "challenge":
            raise UpstreamBlockedError()
        if status != 200:
            if tolerate_missing and 400 <= status < 500:
                return HttpResponse(str(response.url), status, "", "")
            if status == 404:
                raise PlayerNotFoundError()
            raise UpstreamUnavailableError()
        media = response.headers.get("content-type", "").split(";")[0].strip().lower()
        text = response.text
        if media not in accept or not text.strip():
            raise UnexpectedContentError()
        if any(marker in text[:5000].lower() for marker in CHALLENGE_MARKERS):
            raise UpstreamBlockedError()
        return HttpResponse(str(response.url), status, text, media, response.headers.get("etag"))
