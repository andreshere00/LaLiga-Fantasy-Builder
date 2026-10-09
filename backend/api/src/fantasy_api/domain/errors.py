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


class NotFoundError(ApiError):
    """Resource not found in catalog or upstream."""

    def __init__(self, message: str = "not found") -> None:
        super().__init__(message)


class UpstreamError(ApiError):
    """Auth or Fantasy upstream failure.

    Attributes:
        status_code: HTTP status returned to API clients. Provider codes that
            would look like an auth or routing failure stay off this field.
        category: Stable error category for clients.
        provider_status: Upstream HTTP status kept for logs and warnings.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        category: str = "upstream_error",
        provider_status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.category = category
        self.provider_status = provider_status
