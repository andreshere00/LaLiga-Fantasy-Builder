"""Domain errors for the Fantasy Builder API."""


class ApiError(Exception):
    """Base API error."""


class UnauthorizedError(ApiError):
    """Missing or invalid caller credentials."""

    def __init__(self, message: str = "unauthorized") -> None:
        super().__init__(message)


class NeedsReauthError(ApiError):
    """LaLiga credentials require re-pairing."""

    def __init__(self, message: str = "needs_reauth") -> None:
        super().__init__(message)


class UpstreamError(ApiError):
    """Auth or Fantasy upstream failure.

    Attributes:
        status_code: Optional HTTP status from upstream.
        category: Stable error category for clients.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        category: str = "upstream_error",
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.category = category
