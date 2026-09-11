"""Domain and application error hierarchy."""


class AuthError(Exception):
    """Base error for authentication and delegation failures."""


class ProviderError(AuthError):
    """Upstream identity or Fantasy API failure.

    Attributes:
        status_code: Optional HTTP status from the provider.
        category: Stable error category for clients (no payload leak).
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        category: str = "provider_error",
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.category = category


class InvalidGrant(ProviderError):
    """Refresh or code exchange rejected as invalid_grant / AADB2C90088."""

    def __init__(self, message: str = "invalid_grant") -> None:
        super().__init__(message, status_code=400, category="invalid_grant")


class NeedsReauth(AuthError):
    """Stored LaLiga credentials can no longer be refreshed.

    Attributes:
        user_id: Application user that must re-pair.
    """

    def __init__(self, user_id: str, message: str = "needs_reauth") -> None:
        super().__init__(message)
        self.user_id = user_id


class PairingError(AuthError):
    """Pairing create/complete failure (expired, replay, bad secret)."""

    def __init__(self, message: str, *, category: str = "pairing_error") -> None:
        super().__init__(message)
        self.category = category


class SessionError(AuthError):
    """Missing or invalid application session."""

    def __init__(self, message: str = "unauthorized") -> None:
        super().__init__(message)


class ValidationError(AuthError):
    """Token or claim validation failure."""

    def __init__(self, message: str, *, category: str = "validation_error") -> None:
        super().__init__(message)
        self.category = category


class OwnershipError(AuthError):
    """Resource does not belong to the authenticated user."""

    def __init__(self, message: str = "forbidden") -> None:
        super().__init__(message)
