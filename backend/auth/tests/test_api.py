# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import asyncio
import base64
from dataclasses import replace
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient

from fantasy_auth.adapters.memory import (
    FixedClock,
    MemoryConnectionRepo,
    MemoryPairingStore,
    MemoryRateLimiter,
    MemorySessionStore,
)
from fantasy_auth.adapters.vault_aesgcm import AesGcmTokenVault
from fantasy_auth.api.deps import AppContainer, set_container
from fantasy_auth.application.credentials import CredentialProvider
from fantasy_auth.application.pairing import PairingService
from fantasy_auth.application.sessions import SessionService
from fantasy_auth.config import Settings
from fantasy_auth.domain.users import AppUser
from fantasy_auth.main import create_app
from fantasy_auth.ports.repos import SessionRecord

NOW = 1_700_000_000
ORIGIN = "http://localhost:3000"


class FakeJwks:
    async def validate(self, token: str, **kwargs: Any) -> dict[str, Any]:
        return {
            "sub": "sub",
            "email": "a@b.c",
            "name": "A",
            "nonce": kwargs.get("nonce"),
        }


class FakeFantasy:
    async def get_current_user(self, bearer_token: str) -> dict[str, Any]:
        return {"id": "mgr-9", "managerName": "TestMgr"}


class FakeB2C:
    def build_authorize_url(self, **kwargs: Any) -> str:
        return "https://example/authorize"

    async def exchange_code(self, **kwargs: Any) -> Any:
        raise NotImplementedError

    async def refresh(self, **kwargs: Any) -> dict[str, Any]:
        return {"access_token": "x", "expires_in": 100}


async def _async_tokens(code: str, _verifier: str) -> dict[str, Any]:
    return {
        "sub": "app-user-42",
        "email": "u@example.com",
        "name": "User",
        "code": code,
    }


def build_test_container() -> AppContainer:
    settings = Settings(
        use_memory_store=True,
        cookie_secure=False,
        cors_origins=[ORIGIN],
        token_vault_key_base64=base64.b64encode(b"t" * 32).decode(),
        app_oidc_client_id="app-client",
        laliga_allow_id_token_fallback=True,
    )
    clock = FixedClock(NOW)
    session_store = MemorySessionStore()
    pairing_store = MemoryPairingStore()
    connection_repo = MemoryConnectionRepo()
    vault = AesGcmTokenVault.from_base64(settings.token_vault_key_base64)
    rate_limiter = MemoryRateLimiter()

    sessions = SessionService(
        sessions=session_store,
        clock=clock,
        session_ttl_seconds=settings.session_ttl_seconds,
        authorize_url=settings.app_oidc_authorize_url,
        token_url=settings.app_oidc_token_url,
        client_id=settings.app_oidc_client_id,
        client_secret=settings.app_oidc_client_secret,
        redirect_uri=settings.app_oidc_redirect_uri,
        issuer=settings.app_oidc_issuer,
        token_exchanger=_async_tokens,
        claims_from_tokens=lambda tokens: AppUser(
            user_id=str(tokens["sub"]),
            email=tokens.get("email"),
            name=tokens.get("name"),
        ),
    )
    pairings = PairingService(
        pairings=pairing_store,
        connections=connection_repo,
        vault=vault,
        jwks=FakeJwks(),
        fantasy=FakeFantasy(),
        clock=clock,
        client_id=settings.laliga_client_id,
        policy=settings.laliga_signin_policy,
        allow_id_token_fallback=True,
        b2c=FakeB2C(),
    )
    credentials = CredentialProvider(
        connections=connection_repo,
        vault=vault,
        b2c=FakeB2C(),
        clock=clock,
    )
    return AppContainer(
        settings=settings,
        sessions=sessions,
        pairings=pairings,
        credentials=credentials,
        rate_limiter=rate_limiter,
        clock=clock,
        session_store=session_store,
    )


async def _seed_authenticated_session(container: AppContainer) -> SessionRecord:
    start = await container.sessions.start_login()
    session = await container.session_store.get(start.session_id)
    assert session is not None
    bound = replace(
        session,
        user=AppUser(user_id="app-user-42", email="u@example.com", name="User"),
        oidc_state=None,
        oidc_nonce=None,
        oidc_code_verifier=None,
    )
    await container.session_store.save(bound)
    return bound


@pytest.fixture
def container() -> AppContainer:
    return build_test_container()


@pytest.fixture
def client(container: AppContainer) -> Iterator[TestClient]:
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    with TestClient(app) as test_client:
        yield test_client


def _auth_cookies(session: SessionRecord) -> dict[str, str]:
    return {
        "fantasy_session": session.session_id,
        "fantasy_csrf": session.csrf_token,
    }


def _csrf_headers(session: SessionRecord, origin: str = ORIGIN) -> dict[str, str]:
    return {"X-CSRF-Token": session.csrf_token, "Origin": origin}


# ---- Happy path ---- #


def test_health_ok(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/health")

    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"


def test_auth_login_redirects_and_sets_cookies(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/auth/login", follow_redirects=False)

    # Assert
    assert response.status_code == 302
    assert "fantasy_session" in response.cookies
    assert "fantasy_csrf" in response.cookies


def test_auth_callback_binds_user(
    client: TestClient,
    container: AppContainer,
) -> None:
    # Arrange
    login = client.get("/auth/login", follow_redirects=False)
    session_id = login.cookies["fantasy_session"]
    session = asyncio.run(container.session_store.get(session_id))
    assert session is not None
    assert session.oidc_state is not None

    # Act
    response = client.get(
        "/auth/callback",
        params={"code": "abc", "state": session.oidc_state},
        cookies=_auth_cookies(session),
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["user_id"] == "app-user-42"
    assert "csrf_token" in body


def test_create_pairing_requires_csrf_and_returns_secret(
    client: TestClient,
    container: AppContainer,
) -> None:
    # Arrange
    session = asyncio.run(_seed_authenticated_session(container))

    # Act
    response = client.post(
        "/laliga/pairings",
        headers=_csrf_headers(session),
        cookies=_auth_cookies(session),
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert "pairing_id" in body
    assert "secret" in body
    assert "nonce" in body


def test_complete_pairing_from_helper(
    client: TestClient,
    container: AppContainer,
) -> None:
    # Arrange
    session = asyncio.run(_seed_authenticated_session(container))
    created = client.post(
        "/laliga/pairings",
        headers=_csrf_headers(session),
        cookies=_auth_cookies(session),
    ).json()

    # Act
    response = client.post(
        f"/laliga/pairings/{created['pairing_id']}/complete",
        json={
            "secret": created["secret"],
            "token_response": {
                "access_token": "tok",
                "id_token": "idt",
                "refresh_token": "rt",
                "expires_in": 3600,
            },
        },
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["manager_id"] == "mgr-9"
    assert "access_token" not in body
    assert "refresh_token" not in body


# ---- Error paths ---- #


def test_create_pairing_rejects_bad_origin(
    client: TestClient,
    container: AppContainer,
) -> None:
    # Arrange
    session = asyncio.run(_seed_authenticated_session(container))

    # Act
    response = client.post(
        "/laliga/pairings",
        headers=_csrf_headers(session, origin="https://evil.example"),
        cookies=_auth_cookies(session),
    )

    # Assert
    assert response.status_code == 401


def test_create_pairing_rejects_missing_csrf(
    client: TestClient,
    container: AppContainer,
) -> None:
    # Arrange
    session = asyncio.run(_seed_authenticated_session(container))

    # Act
    response = client.post(
        "/laliga/pairings",
        headers={"Origin": ORIGIN},
        cookies=_auth_cookies(session),
    )

    # Assert
    assert response.status_code == 401


def test_me_unauthorized_without_session(client: TestClient) -> None:
    # Arrange / Act
    response = client.get("/auth/me")

    # Assert
    assert response.status_code == 401


# ---- Edge cases ---- #


def test_delete_connection_unlinks(
    client: TestClient,
    container: AppContainer,
) -> None:
    # Arrange
    session = asyncio.run(_seed_authenticated_session(container))
    cookies = _auth_cookies(session)
    headers = _csrf_headers(session)
    created = client.post(
        "/laliga/pairings",
        headers=headers,
        cookies=cookies,
    ).json()
    client.post(
        f"/laliga/pairings/{created['pairing_id']}/complete",
        json={
            "secret": created["secret"],
            "token_response": {
                "access_token": "tok",
                "id_token": "idt",
                "expires_in": 100,
            },
        },
    )

    # Act
    response = client.delete(
        "/laliga/connection",
        headers=headers,
        cookies=cookies,
    )
    status = client.get("/laliga/connection", cookies=cookies)

    # Assert
    assert response.status_code == 200
    assert status.json()["linked"] is False
