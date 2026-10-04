"""Scraper exception hierarchy. ``detail`` is a fixed sentence, never upstream content."""

from typing import ClassVar


class ScrapingError(Exception):
    """Base class carrying the wire category and HTTP status.

    Attributes:
        category: Stable machine-readable error name.
        status_code: HTTP status the private surface answers with.
        detail: Fixed human sentence safe to return to callers.
    """

    category: ClassVar[str] = "scraping_error"
    status_code: ClassVar[int] = 502
    detail: ClassVar[str] = "scraping failed"

    def __init__(self, detail: str | None = None) -> None:
        """Store an optional detail override.

        Args:
            detail: Replacement for the class-level sentence.
        """
        self.message: str = detail or self.detail
        super().__init__(self.message)


class PlayerNotFoundError(ScrapingError):
    """Player not found."""

    category = "player_not_found"
    status_code = 404
    detail = "player not found"


class HostNotAllowedError(ScrapingError):
    """Host not allowed."""

    category = "host_not_allowed"
    status_code = 400
    detail = "host not allowed"


class InvalidRequestError(ScrapingError):
    """Invalid request."""

    category = "invalid_request"
    status_code = 422
    detail = "invalid request"


class RobotsDisallowedError(ScrapingError):
    """Robots.txt disallows this path."""

    category = "robots_disallowed"
    status_code = 403
    detail = "robots.txt disallows this path"


class UpstreamBlockedError(ScrapingError):
    """Upstream blocked the request."""

    category = "upstream_blocked"
    status_code = 503
    detail = "upstream blocked the request"


class UpstreamRateLimitedError(ScrapingError):
    """Upstream rate limit reached."""

    category = "upstream_rate_limited"
    status_code = 503
    detail = "upstream rate limit reached"


class UpstreamTimeoutError(ScrapingError):
    """Upstream timed out."""

    category = "upstream_timeout"
    status_code = 504
    detail = "upstream timed out"


class UpstreamUnavailableError(ScrapingError):
    """Upstream unavailable."""

    category = "upstream_unavailable"
    status_code = 502
    detail = "upstream unavailable"


class UnexpectedContentError(ScrapingError):
    """Unexpected upstream content."""

    category = "unexpected_content"
    status_code = 502
    detail = "unexpected upstream content"


class LinkDataUnavailableError(ScrapingError):
    """Player index unavailable."""

    category = "linkdata_unavailable"
    status_code = 503
    detail = "player index unavailable"


class CircuitOpenError(ScrapingError):
    """Circuit breaker is open."""

    category = "circuit_open"
    status_code = 503
    detail = "circuit breaker is open"


class AmbiguousPlayerError(ScrapingError):
    """Several players match and the team did not settle it.

    Attributes:
        candidates: Slugs that still match, at most five.
    """

    category = "player_ambiguous"
    status_code = 409
    detail = "player name is ambiguous"

    def __init__(self, candidates: list[str]) -> None:
        """Keep the capped candidate list.

        Args:
            candidates: Matching slugs.
        """
        super().__init__()
        self.candidates: list[str] = candidates[:5]
