"""robots.txt policy with RFC 9309 failure semantics."""

from collections.abc import Awaitable, Callable
from urllib.robotparser import RobotFileParser

from fantasy_scraping.scraper.clock import Clock
from fantasy_scraping.scraper.errors import (
    RobotsDisallowedError,
    UpstreamBlockedError,
    UpstreamTimeoutError,
    UpstreamUnavailableError,
)
from fantasy_scraping.scraper.urls import ROBOTS_URL

RobotsFetch = Callable[[], Awaitable[tuple[int, str]]]
ALLOW_TTL_S: float = 86_400
FAILURE_TTL_S: float = 3_600


class RobotsPolicy:
    """Fetches robots.txt once per day and answers ``can_fetch``."""

    def __init__(self, fetch: RobotsFetch, user_agent: str, clock: Clock) -> None:
        """Bind the fetcher.

        Args:
            fetch: Coroutine returning ``(status, text)`` for robots.txt.
            user_agent: Product token matched against the rules.
            clock: Time source for cache expiry.
        """
        self._fetch: RobotsFetch = fetch
        self._agent: str = user_agent
        self._clock: Clock = clock
        self._parser: RobotFileParser | None = None
        self._disallow_all: bool = False
        self._expires: float = float("-inf")

    async def ensure_allowed(self, url: str) -> None:
        """Raise unless ``url`` may be fetched.

        Args:
            url: Absolute URL about to be requested.

        Raises:
            RobotsDisallowedError: The rules or a robots outage forbid the URL.
            UpstreamBlockedError: robots.txt itself answered 403.
        """
        if url == ROBOTS_URL:
            return
        if self._clock.monotonic() >= self._expires:
            await self._refresh()
        if self._disallow_all or (self._parser and not self._parser.can_fetch(self._agent, url)):
            raise RobotsDisallowedError()

    async def _refresh(self) -> None:
        """Load robots.txt and set the cache window."""
        try:
            status, text = await self._fetch()
        except UpstreamTimeoutError, UpstreamUnavailableError:
            self._set(None, disallow_all=True, ttl=FAILURE_TTL_S)
            return
        if status == 403:
            raise UpstreamBlockedError()
        if status >= 500:
            self._set(None, disallow_all=True, ttl=FAILURE_TTL_S)
        elif status >= 400:
            self._set(None, disallow_all=False, ttl=ALLOW_TTL_S)
        else:
            parser = RobotFileParser()
            parser.parse(text.splitlines())
            self._set(parser, disallow_all=False, ttl=ALLOW_TTL_S)

    def _set(self, parser: RobotFileParser | None, *, disallow_all: bool, ttl: float) -> None:
        """Store the parsed rules and their expiry."""
        self._parser, self._disallow_all = parser, disallow_all
        self._expires = self._clock.monotonic() + ttl
