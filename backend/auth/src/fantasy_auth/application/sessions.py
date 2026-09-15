"""Application session use cases (own IdP, not LaLiga)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Any
from uuid import uuid4

import httpx

from fantasy_auth.adapters.pkce import generate_state, generate_verifier, s256_challenge
from fantasy_auth.domain.errors import SessionError, ValidationError
from fantasy_auth.domain.users import AppUser, extract_app_user_from_claims
from fantasy_auth.ports.identity import AppOidcValidator
from fantasy_auth.ports.repos import Clock, SessionRecord, SessionStore


@dataclass(frozen=True, slots=True)
class LoginStart:
    """Result of starting an app OIDC login.

    Attributes:
        authorize_url: Redirect the browser here.
        session_id: Opaque session cookie value.
        csrf_token: CSRF double-submit token.
    """

    authorize_url: str
    session_id: str
    csrf_token: str


@dataclass(frozen=True, slots=True)
class SessionView:
    """Public session view (no secrets).

    Attributes:
        user: Authenticated app user.
        csrf_token: CSRF token for the client.
    """

    user: AppUser
    csrf_token: str


class SessionService:
    """Manage opaque app sessions backed by an external OIDC provider.

    For hermetic tests, inject ``token_exchanger`` and ``claims_from_tokens``
    callables instead of hitting a real IdP.

    Args:
        sessions: Session store.
        clock: Injectable clock.
        session_ttl_seconds: Session lifetime.
        authorize_url: App IdP authorize endpoint.
        token_url: App IdP token endpoint.
        client_id: App OIDC client ID.
        client_secret: App OIDC client secret.
        redirect_uri: Registered callback.
        issuer: Expected issuer.
        oidc_validator: JWKS-backed ID token validator (required in production).
        token_exchanger: Optional async ``(code, verifier) -> token JSON``.
        claims_from_tokens: Optional ``token JSON -> AppUser`` (tests only).
    """

    def __init__(
        self,
        *,
        sessions: SessionStore,
        clock: Clock,
        session_ttl_seconds: int,
        authorize_url: str,
        token_url: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        issuer: str,
        oidc_validator: AppOidcValidator | None = None,
        token_exchanger: Any = None,
        claims_from_tokens: Any = None,
    ) -> None:
        self._sessions = sessions
        self._clock = clock
        self._session_ttl_seconds = session_ttl_seconds
        self._authorize_url = authorize_url
        self._token_url = token_url
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri
        self._issuer = issuer
        self._oidc_validator = oidc_validator
        self._token_exchanger = token_exchanger
        self._claims_from_tokens = claims_from_tokens

    async def start_login(self) -> LoginStart:
        """Create a pending session and return the IdP authorize URL.

        Returns:
            Login start payload with authorize URL and cookie values.
        """
        now = self._clock.now()
        session_id = str(uuid4())
        csrf_token = generate_state(24)
        state = generate_state()
        nonce = generate_state()
        code_verifier = generate_verifier()
        challenge = s256_challenge(code_verifier)

        session = SessionRecord(
            session_id=session_id,
            user=None,
            csrf_token=csrf_token,
            expires_at=now + self._session_ttl_seconds,
            oidc_state=state,
            oidc_nonce=nonce,
            oidc_code_verifier=code_verifier,
        )
        await self._sessions.save(session)

        from urllib.parse import urlencode

        params = {
            "client_id": self._client_id,
            "response_type": "code",
            "redirect_uri": self._redirect_uri,
            "scope": "openid profile email",
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        authorize_url = f"{self._authorize_url}?{urlencode(params)}"
        return LoginStart(
            authorize_url=authorize_url,
            session_id=session_id,
            csrf_token=csrf_token,
        )

    async def complete_login(
        self,
        *,
        session_id: str,
        code: str,
        state: str,
    ) -> SessionView:
        """Exchange the app IdP code and bind the user to the session.

        Args:
            session_id: Opaque session from the cookie.
            code: Authorization code from the IdP.
            state: State echoed by the IdP (must match).

        Returns:
            Authenticated session view.

        Raises:
            SessionError: Missing/expired session or state mismatch.
            ValidationError: Token / claims failure.
        """
        session = await self._require_session(session_id, require_user=False)
        if not session.oidc_state or session.oidc_state != state:
            raise SessionError("state mismatch")
        if not session.oidc_code_verifier:
            raise SessionError("missing code_verifier")

        if self._token_exchanger is not None:
            tokens = await self._token_exchanger(code, session.oidc_code_verifier)
        else:
            tokens = await self._default_exchange(code, session.oidc_code_verifier)

        if self._claims_from_tokens is not None:
            user = self._claims_from_tokens(tokens)
        else:
            user = await self._user_from_validated_id_token(
                tokens,
                nonce=session.oidc_nonce,
            )

        now = self._clock.now()
        updated = replace(
            session,
            user=user,
            expires_at=now + self._session_ttl_seconds,
            oidc_state=None,
            oidc_nonce=None,
            oidc_code_verifier=None,
            csrf_token=generate_state(24),
        )
        await self._sessions.save(updated)
        return SessionView(user=user, csrf_token=updated.csrf_token)

    async def logout(self, session_id: str) -> None:
        """Delete the server-side session.

        Args:
            session_id: Opaque session cookie value.
        """
        await self._sessions.delete(session_id)

    async def get_me(self, session_id: str) -> SessionView:
        """Return the authenticated session view.

        Args:
            session_id: Opaque session cookie value.

        Returns:
            Session view with user and CSRF token.
        """
        session = await self._require_session(session_id, require_user=True)
        assert session.user is not None
        return SessionView(user=session.user, csrf_token=session.csrf_token)

    async def require_user(self, session_id: str) -> tuple[AppUser, SessionRecord]:
        """Load the authenticated user or raise.

        Args:
            session_id: Opaque session cookie value.

        Returns:
            Tuple of app user and full session record.
        """
        session = await self._require_session(session_id, require_user=True)
        assert session.user is not None
        return session.user, session

    async def _require_session(
        self,
        session_id: str,
        *,
        require_user: bool,
    ) -> SessionRecord:
        if not session_id:
            raise SessionError()
        session = await self._sessions.get(session_id)
        if session is None:
            raise SessionError()
        if session.expires_at <= self._clock.now():
            await self._sessions.delete(session_id)
            raise SessionError("session expired")
        if require_user and session.user is None:
            raise SessionError()
        return session

    async def _default_exchange(
        self,
        code: str,
        code_verifier: str,
    ) -> Mapping[str, Any]:
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self._redirect_uri,
            "client_id": self._client_id,
            "code_verifier": code_verifier,
        }
        # Public clients (Keycloak PKCE) must not send an empty client_secret.
        if self._client_secret:
            data["client_secret"] = self._client_secret
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self._token_url, data=data)
        if not response.is_success:
            raise ValidationError(f"app idp token exchange failed: {response.status_code}")
        return response.json()

    async def _user_from_validated_id_token(
        self,
        tokens: Mapping[str, Any],
        *,
        nonce: str | None,
    ) -> AppUser:
        """Validate the ID token against JWKS and extract the app user.

        Args:
            tokens: Token endpoint JSON response.
            nonce: Expected OIDC nonce from the pending session.

        Returns:
            Authenticated application user.

        Raises:
            ValidationError: Missing ID token or JWT validation failure.
        """
        if self._oidc_validator is None:
            raise ValidationError(
                "app OIDC validator not configured",
                category="oidc_misconfigured",
            )
        id_token = tokens.get("id_token")
        if not id_token or not isinstance(id_token, str):
            raise ValidationError("missing id_token", category="missing_id_token")

        claims = await self._oidc_validator.validate(
            id_token,
            audience=self._client_id,
            issuer=self._issuer,
            nonce=nonce,
        )
        try:
            return extract_app_user_from_claims(claims)
        except ValueError as exc:
            raise ValidationError(str(exc), category="jwt_invalid") from exc
