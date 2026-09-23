"""One-time pairing use cases for the local PKCE helper."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from fantasy_auth.adapters.pkce import (
    constant_time_equals,
    generate_pairing_secret,
    generate_state,
    generate_verifier,
    hash_secret,
    s256_challenge,
)
from fantasy_auth.domain.errors import OwnershipError, PairingError
from fantasy_auth.domain.tokens import normalize_bundle
from fantasy_auth.domain.users import (
    LaligaUser,
    extract_user_from_claims,
    merge_jwt_with_profile,
)
from fantasy_auth.ports.b2c import B2CClient, JwksValidator
from fantasy_auth.ports.fantasy import FantasyClient
from fantasy_auth.ports.repos import (
    Clock,
    ConnectionRecord,
    ConnectionRepo,
    PairingRecord,
    PairingStore,
)
from fantasy_auth.ports.vault import TokenVault


@dataclass(frozen=True, slots=True)
class PairingCreated:
    """Result of creating a pairing (secret shown once).

    Attributes:
        pairing_id: Public pairing identifier.
        secret: One-time plaintext secret for the helper.
        expires_at: Unix expiry.
        nonce: Expected OIDC nonce for the helper authorize request.
    """

    pairing_id: str
    secret: str
    expires_at: int
    nonce: str


@dataclass(frozen=True, slots=True)
class PairingCompleted:
    """Result of a successful pairing completion (no tokens).

    Attributes:
        user_id: Application user that was linked.
        profile: Merged LaLiga profile.
    """

    user_id: str
    profile: LaligaUser


@dataclass(frozen=True, slots=True)
class BrowserPairingStart:
    """Authorize URL and secrets kept on the server session.

    Attributes:
        authorize_url: B2C URL to open in the browser.
        pairing_id: Public pairing identifier.
        secret: One-time pairing secret. Never return this to the browser.
        code_verifier: PKCE verifier for the code exchange.
        b2c_state: State echoed by the native callback.
    """

    authorize_url: str
    pairing_id: str
    secret: str
    code_verifier: str
    b2c_state: str


class PairingService:
    """Create and complete one-time LaLiga pairings.

    Args:
        pairings: Pairing store.
        connections: Connection repository.
        vault: Token vault.
        b2c: B2C client (optional; helper may exchange locally).
        jwks: JWKS validator for inbound tokens.
        fantasy: Fantasy client for ownership confirmation.
        clock: Injectable clock.
        client_id: LaLiga B2C client ID.
        policy: LaLiga sign-in policy.
        scope: Default PKCE scope.
        pairing_ttl_seconds: Pairing lifetime.
        allow_id_token_fallback: Prefer id_token when access_token absent.
    """

    def __init__(
        self,
        *,
        pairings: PairingStore,
        connections: ConnectionRepo,
        vault: TokenVault,
        jwks: JwksValidator,
        fantasy: FantasyClient,
        clock: Clock,
        client_id: str,
        policy: str,
        scope: str = "openid offline_access",
        pairing_ttl_seconds: int = 600,
        allow_id_token_fallback: bool = False,
        b2c: B2CClient | None = None,
        redirect_uri: str = "authredirect://com.lfp.laligafantasy",
    ) -> None:
        self._pairings = pairings
        self._connections = connections
        self._vault = vault
        self._jwks = jwks
        self._fantasy = fantasy
        self._clock = clock
        self._client_id = client_id
        self._policy = policy
        self._scope = scope
        self._pairing_ttl_seconds = pairing_ttl_seconds
        self._allow_id_token_fallback = allow_id_token_fallback
        self._b2c = b2c
        self._redirect_uri = redirect_uri

    async def create_pairing(self, user_id: str) -> PairingCreated:
        """Issue a one-time pairing for the authenticated app user.

        Args:
            user_id: Application user ID from the session.

        Returns:
            Pairing credentials (secret shown once).
        """
        now = self._clock.now()
        pairing_id = str(uuid4())
        secret = generate_pairing_secret()
        nonce = generate_state()
        expires_at = now + self._pairing_ttl_seconds
        record = PairingRecord(
            pairing_id=pairing_id,
            user_id=user_id,
            secret_hash=hash_secret(secret),
            expires_at=expires_at,
            consumed=False,
            nonce=nonce,
        )
        await self._pairings.save(record)
        return PairingCreated(
            pairing_id=pairing_id,
            secret=secret,
            expires_at=expires_at,
            nonce=nonce,
        )

    async def begin_browser_login(self, user_id: str) -> BrowserPairingStart:
        """Create a pairing and the B2C authorize URL for this app user.

        Args:
            user_id: Application user ID from the session.

        Returns:
            Authorize URL and server-side PKCE material.

        Raises:
            PairingError: When the B2C client is not configured.
        """
        created = await self.create_pairing(user_id)
        if self._b2c is None:
            raise PairingError("b2c client unavailable", category="provider")
        verifier = generate_verifier()
        state = generate_state()
        authorize_url = self._b2c.build_authorize_url(
            redirect_uri=self._redirect_uri,
            code_challenge=s256_challenge(verifier),
            state=state,
            nonce=created.nonce,
        )
        return BrowserPairingStart(
            authorize_url=authorize_url,
            pairing_id=created.pairing_id,
            secret=created.secret,
            code_verifier=verifier,
            b2c_state=state,
        )

    async def complete_browser_redirect(
        self,
        *,
        callback: str,
        pairing_id: str,
        secret: str,
        code_verifier: str,
        expected_state: str,
    ) -> PairingCompleted:
        """Exchange a native callback and seal the tokens for the pairing.

        Args:
            callback: Full ``authredirect://`` URL.
            pairing_id: Pending pairing id stored on the session.
            secret: Pending pairing secret stored on the session.
            code_verifier: PKCE verifier stored on the session.
            expected_state: B2C state stored on the session.

        Returns:
            Completion result with the merged profile.

        Raises:
            PairingError: When the callback or token exchange is invalid.
        """
        params = _callback_params(callback, expected_state=expected_state)
        if params.get("error"):
            raise PairingError(str(params["error"]), category="pairing_callback")
        code = params.get("code")
        if not code or self._b2c is None:
            raise PairingError("callback missing code", category="pairing_callback")
        try:
            bundle = await self._b2c.exchange_code(
                code=code,
                code_verifier=code_verifier,
                redirect_uri=self._redirect_uri,
            )
        except Exception as exc:
            raise PairingError("token exchange failed", category="provider") from exc
        token_response = {
            "access_token": bundle.access_token,
            "id_token": bundle.id_token,
            "refresh_token": bundle.refresh_token,
            "token_type": bundle.token_type,
            "expires_in": bundle.expires_in,
            "expires_on": bundle.expires_on,
            "client_id": bundle.client_id,
            "policy": bundle.policy,
            "scope": bundle.scope,
        }
        return await self.complete_pairing(
            pairing_id=pairing_id,
            secret=secret,
            token_response=token_response,
        )

    async def complete_pairing(
        self,
        *,
        pairing_id: str,
        secret: str,
        token_response: Mapping[str, Any],
    ) -> PairingCompleted:
        """Validate helper-submitted tokens and seal them for the owner.

        Args:
            pairing_id: Public pairing identifier.
            secret: Plaintext pairing secret from create.
            token_response: Raw B2C token JSON from the helper.

        Returns:
            Completion result with merged profile (no tokens).

        Raises:
            PairingError: On expired, consumed, or bad secret.
            ValidationError: On JWT validation failure.
            OwnershipError: Reserved for cross-user misuse (not expected here).
        """
        now = self._clock.now()
        existing = await self._pairings.get(pairing_id)
        if existing is None:
            raise PairingError("pairing not found", category="pairing_not_found")
        if existing.consumed:
            raise PairingError("pairing already used", category="pairing_replay")
        if existing.expires_at <= now:
            raise PairingError("pairing expired", category="pairing_expired")
        if not constant_time_equals(existing.secret_hash, hash_secret(secret)):
            raise PairingError("invalid pairing secret", category="pairing_secret")

        # Secret verified — consume atomically (guards concurrent completes).
        pairing = await self._pairings.consume(pairing_id, now=now)
        if pairing is None:
            raise PairingError("pairing already used", category="pairing_replay")

        bundle = normalize_bundle(
            token_response,
            now=now,
            client_id=self._client_id,
            policy=self._policy,
            scope=self._scope,
            allow_id_token_fallback=self._allow_id_token_fallback,
        )

        token_to_validate = bundle.id_token or bundle.access_token
        claims = await self._jwks.validate(
            token_to_validate,
            policy=bundle.policy,
            audience=bundle.client_id,
            nonce=pairing.nonce,
        )
        jwt_user = extract_user_from_claims(claims)

        api_user = await self._fantasy.get_current_user(bundle.bearer())
        profile = merge_jwt_with_profile(jwt_user, api_user)

        sealed = self._vault.seal(bundle)
        connection = ConnectionRecord(
            user_id=pairing.user_id,
            sealed_blob=sealed,
            policy=bundle.policy,
            client_id=bundle.client_id,
            scope=bundle.scope,
            needs_reauth=False,
            profile=profile,
        )
        await self._connections.save(connection)

        return PairingCompleted(user_id=pairing.user_id, profile=profile)

    async def get_status(self, user_id: str) -> dict[str, Any]:
        """Return public connection status for a user (no secrets).

        Args:
            user_id: Application user ID.

        Returns:
            Status dict with linked / needs_reauth / manager fields.
        """
        connection = await self._connections.get(user_id)
        if connection is None:
            return {
                "linked": False,
                "needs_reauth": False,
                "manager_id": None,
                "manager_name": None,
            }
        profile = connection.profile
        return {
            "linked": True,
            "needs_reauth": connection.needs_reauth,
            "manager_id": profile.user_id if profile else None,
            "manager_name": profile.manager_name if profile else None,
        }

    async def unlink(self, user_id: str) -> None:
        """Delete sealed LaLiga tokens for a user.

        Args:
            user_id: Application user ID.
        """
        connection = await self._connections.get(user_id)
        if connection is None:
            return
        if connection.user_id != user_id:
            raise OwnershipError()
        await self._connections.delete(user_id)


def _callback_params(callback: str, *, expected_state: str) -> dict[str, str]:
    """Read code and state from a native LaLiga callback URL.

    Args:
        callback: Full ``authredirect://`` URL.
        expected_state: State stored on the application session.

    Returns:
        Query parameters, or ``{"error": ...}`` when state does not match.
    """
    parsed = urlparse(callback)
    query = parsed.query
    if not query and "?" in callback:
        query = callback.split("?", 1)[1]
    params = {key: values[0] for key, values in parse_qs(query).items() if values}
    if params.get("state") != expected_state:
        return {"error": "state mismatch"}
    return params
