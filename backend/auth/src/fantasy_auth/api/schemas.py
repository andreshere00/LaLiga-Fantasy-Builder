"""Validated JSON contracts for auth HTTP routes."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]


class AuthResponse(BaseModel):
    """Base for auth response DTOs with no undocumented response keys."""

    model_config = ConfigDict(extra="forbid")


class SessionUserResponse(AuthResponse):
    """Public app-user details in a browser session."""

    user_id: StrictStr
    email: StrictStr | None = None
    name: StrictStr | None = None


class SessionViewResponse(AuthResponse):
    """Public session data returned after login and by ``/auth/me``."""

    user: SessionUserResponse
    csrf_token: StrictStr


class OkResponse(AuthResponse):
    """Acknowledgement for completed auth mutations."""

    ok: StrictBool


class InternalTokenResponse(AuthResponse):
    """Short-lived internal JWT for the Fantasy API."""

    access_token: StrictStr
    token_type: StrictStr = "Bearer"
    expires_in: StrictInt = Field(ge=1)
    expires_at: StrictInt = Field(ge=1)


class AuthErrorResponse(BaseModel):
    """Sanitized error shape returned by auth routes."""

    model_config = ConfigDict(extra="forbid")

    error: StrictStr
    detail: StrictStr | None = None


class CompleteRedirectResponse(OkResponse):
    """Native pairing redirect result."""

    frontend_origin: StrictStr


class PairingCompleteResponse(OkResponse):
    """Public result from local helper pairing completion."""

    user_id: StrictStr
    manager_id: StrictStr
    manager_name: StrictStr | None = None
    email: StrictStr | None = None


class HealthResponse(AuthResponse):
    """Liveness response."""

    status: StrictStr


class HealthReadyResponse(HealthResponse):
    """Readiness response for a healthy runtime."""

    store: StrictStr


class HealthNotReadyResponse(HealthResponse):
    """Readiness response when a dependency is unavailable."""

    detail: StrictStr


class JsonWebKey(AuthResponse):
    """Public RSA key published for internal JWT verification."""

    kty: StrictStr
    use: StrictStr | None = None
    kid: StrictStr
    alg: StrictStr | None = None
    n: StrictStr
    e: StrictStr


class JwksResponse(AuthResponse):
    """JSON Web Key Set response."""

    keys: list[JsonWebKey]


class PairingCreateResponse(AuthResponse):
    """One-time pairing credentials for the local helper."""

    pairing_id: StrictStr
    secret: StrictStr
    expires_at: StrictInt = Field(ge=1)
    nonce: StrictStr


class PairingCompleteRequest(BaseModel):
    """Helper-submitted token payload to finish pairing."""

    model_config = ConfigDict(extra="forbid")

    secret: StrictStr = Field(min_length=8)
    token_response: dict[str, JsonValue]


class CompleteRedirectRequest(BaseModel):
    """Native callback captured by the local URL handler."""

    model_config = ConfigDict(extra="forbid")

    callback: StrictStr = Field(min_length=8)


class ConnectionStatusResponse(AuthResponse):
    """Public LaLiga connection state; contains no credential material."""

    linked: StrictBool
    needs_reauth: StrictBool = False
    manager_id: StrictStr | None = None
    manager_name: StrictStr | None = None
    avatar: StrictStr | None = None
