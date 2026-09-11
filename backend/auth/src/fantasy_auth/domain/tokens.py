"""Token bundle domain model and expiry helpers."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Mapping


DEFAULT_TTL_SECONDS = 86_400
DEFAULT_REFRESH_SKEW_SECONDS = 60


@dataclass(frozen=True, slots=True)
class TokenBundle:
    """Normalized OAuth2 token set issued by LaLiga B2C.

    Attributes:
        access_token: Bearer token preferred for Fantasy API calls.
        id_token: OIDC ID token when present.
        refresh_token: Long-lived refresh token when present.
        token_type: Usually ``Bearer``.
        expires_in: Lifetime in seconds from issuance.
        expires_on: Unix timestamp when the bearer expires.
        client_id: B2C client that issued the tokens.
        policy: B2C policy / user flow that issued the tokens.
        scope: Scope string used at issuance (must match on refresh).
        id_token_expires_in: Optional LaLiga-specific ID token TTL.
        refresh_token_expires_in: Optional refresh token TTL.
    """

    access_token: str
    expires_on: int
    client_id: str
    policy: str
    scope: str
    id_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "Bearer"
    expires_in: int = DEFAULT_TTL_SECONDS
    id_token_expires_in: int | None = None
    refresh_token_expires_in: int | None = None

    def bearer(self) -> str:
        """Return the token to send as Authorization Bearer.

        Returns:
            Access token string.
        """
        return self.access_token


def calculate_expiry(
    token_response: Mapping[str, Any],
    *,
    now: int,
) -> int:
    """Compute Unix expiry from a B2C token response.

    Mirrors ``calculateTokenExpiration`` from the TypeScript authService:
    prefer ``expires_on``, then ``id_token_expires_in``, then ``expires_in``,
    else default to 24 hours.

    Args:
        token_response: Raw token JSON from B2C.
        now: Current Unix timestamp in seconds.

    Returns:
        Unix timestamp when the bearer should be considered expired.
    """
    if token_response.get("expires_on") is not None:
        return int(token_response["expires_on"])

    if token_response.get("id_token_expires_in") is not None:
        return now + int(token_response["id_token_expires_in"])

    if token_response.get("expires_in") is not None:
        return now + int(token_response["expires_in"])

    return now + DEFAULT_TTL_SECONDS


def is_expired(
    bundle: TokenBundle,
    *,
    now: int,
    skew_seconds: int = DEFAULT_REFRESH_SKEW_SECONDS,
) -> bool:
    """Return True if the bundle is expired or inside the refresh skew window.

    Args:
        bundle: Token bundle to inspect.
        now: Current Unix timestamp in seconds.
        skew_seconds: Seconds before ``expires_on`` to treat as expired.

    Returns:
        True when a refresh (or re-auth) is required.
    """
    return (bundle.expires_on - now) < skew_seconds


def normalize_bundle(
    token_or_data: str | Mapping[str, Any],
    *,
    now: int,
    client_id: str,
    policy: str,
    scope: str,
    allow_id_token_fallback: bool = False,
) -> TokenBundle:
    """Build a ``TokenBundle`` from a raw access token or OAuth2 response.

    Ports ``buildLoginPayload``: prefers ``access_token``; falls back to
    ``id_token`` only when explicitly allowed.

    Args:
        token_or_data: Bearer string or full token response mapping.
        now: Current Unix timestamp in seconds.
        client_id: Issuing B2C client ID (retained for refresh).
        policy: Issuing B2C policy (retained for refresh).
        scope: Issuing scope string (retained for refresh).
        allow_id_token_fallback: When True, use ``id_token`` if no access token.

    Returns:
        Normalized immutable token bundle.

    Raises:
        ValueError: If no usable bearer token is present.
    """
    if isinstance(token_or_data, str):
        return TokenBundle(
            access_token=token_or_data,
            expires_on=now + DEFAULT_TTL_SECONDS,
            expires_in=DEFAULT_TTL_SECONDS,
            client_id=client_id,
            policy=policy,
            scope=scope,
        )

    access = token_or_data.get("access_token")
    id_token = token_or_data.get("id_token")
    if not access:
        if allow_id_token_fallback and id_token:
            access = id_token
        else:
            raise ValueError("token response missing access_token")

    resolved_client = str(token_or_data.get("client_id") or client_id)
    resolved_policy = str(token_or_data.get("policy") or policy)
    resolved_scope = str(token_or_data.get("scope") or scope)
    expires_in = int(
        token_or_data.get("expires_in")
        or token_or_data.get("id_token_expires_in")
        or DEFAULT_TTL_SECONDS
    )

    return TokenBundle(
        access_token=str(access),
        id_token=str(id_token) if id_token else None,
        refresh_token=(
            str(token_or_data["refresh_token"])
            if token_or_data.get("refresh_token")
            else None
        ),
        token_type=str(token_or_data.get("token_type") or "Bearer"),
        expires_in=expires_in,
        expires_on=calculate_expiry(token_or_data, now=now),
        client_id=resolved_client,
        policy=resolved_policy,
        scope=resolved_scope,
        id_token_expires_in=(
            int(token_or_data["id_token_expires_in"])
            if token_or_data.get("id_token_expires_in") is not None
            else None
        ),
        refresh_token_expires_in=(
            int(token_or_data["refresh_token_expires_in"])
            if token_or_data.get("refresh_token_expires_in") is not None
            else None
        ),
    )


def merge_refresh(
    previous: TokenBundle,
    refresh_response: Mapping[str, Any],
    *,
    now: int,
    allow_id_token_fallback: bool = False,
) -> TokenBundle:
    """Merge a refresh response onto the previous bundle atomically.

    Prefers ``id_token`` as bearer when the response returns one (LaLiga
    quirk observed in community clients), otherwise keeps access_token rules.

    Args:
        previous: Bundle before refresh.
        refresh_response: Raw B2C refresh JSON.
        now: Current Unix timestamp in seconds.
        allow_id_token_fallback: Fallback policy for missing access_token.

    Returns:
        New bundle with rotated tokens; policy/client/scope preserved.
    """
    # Prefer id_token as bearer when B2C returns it (community clients do this).
    bearer = refresh_response.get("id_token") or refresh_response.get("access_token")
    if not bearer and allow_id_token_fallback:
        bearer = previous.access_token
    if not bearer:
        raise ValueError("refresh response missing bearer token")

    new_refresh = refresh_response.get("refresh_token") or previous.refresh_token
    expires_in = int(
        refresh_response.get("id_token_expires_in")
        or refresh_response.get("expires_in")
        or previous.expires_in
    )

    return replace(
        previous,
        access_token=str(bearer),
        id_token=(
            str(refresh_response["id_token"])
            if refresh_response.get("id_token")
            else previous.id_token
        ),
        refresh_token=str(new_refresh) if new_refresh else None,
        expires_in=expires_in,
        expires_on=calculate_expiry(refresh_response, now=now),
        id_token_expires_in=(
            int(refresh_response["id_token_expires_in"])
            if refresh_response.get("id_token_expires_in") is not None
            else previous.id_token_expires_in
        ),
        refresh_token_expires_in=(
            int(refresh_response["refresh_token_expires_in"])
            if refresh_response.get("refresh_token_expires_in") is not None
            else previous.refresh_token_expires_in
        ),
    )
