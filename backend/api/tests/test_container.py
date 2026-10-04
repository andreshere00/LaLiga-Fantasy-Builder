"""Shared wired ``AppContainer`` factory for API integration tests."""

from __future__ import annotations

import httpx
from fantasy_api.api.deps import AppContainer, build_container
from fantasy_api.config import Settings
from fantasy_api.security.internal_jwt import StaticInternalJwtValidator
from jwt_mint import DEFAULT_TEST_AUDIENCE, DEFAULT_TEST_ISSUER

TEST_ISSUER = DEFAULT_TEST_ISSUER
TEST_AUDIENCE = DEFAULT_TEST_AUDIENCE
TEST_SERVICE_TOKEN = "api-service-token"
TEST_FANTASY_ORIGIN = "https://fantasy.test"
TEST_LALIGA_BEARER = "laliga-secret-token"


def default_auth_ok_handler(request: httpx.Request) -> httpx.Response:
    """Return a mock LaLiga bearer from the auth credentials client."""
    import time

    assert request.url.path == "/internal/laliga/bearer"
    assert request.headers.get("X-Service-Token") == TEST_SERVICE_TOKEN
    assert request.headers.get("Authorization", "").startswith("Bearer ")
    return httpx.Response(
        200,
        json={
            "bearer_token": TEST_LALIGA_BEARER,
            "expires_at": int(time.time()) + 100,
            "token_type": "Bearer",
        },
    )


def test_settings() -> Settings:
    """Return baseline settings for wired API test containers."""
    return Settings(
        auth_jwks_url="http://auth.test/jwks",
        internal_jwt_issuer=TEST_ISSUER,
        internal_jwt_audience=TEST_AUDIENCE,
        auth_internal_base_url="http://auth.test",
        internal_service_token=TEST_SERVICE_TOKEN,
        laliga_fantasy_origin=TEST_FANTASY_ORIGIN,
        laliga_competition_id=1,
        log_json=False,
    )


def build_test_container(
    public_pem: str,
    *,
    auth_handler: httpx.MockTransport | None = None,
    fantasy_handler: httpx.MockTransport | None = None,
    scraping_transport: httpx.AsyncBaseTransport | None = None,
    weather_transport: httpx.AsyncBaseTransport | None = None,
    settings: Settings | None = None,
) -> AppContainer:
    """Wire a full ``AppContainer`` for HTTP integration tests."""
    from fantasy_api.clients.auth_credentials import AuthCredentialsClient
    from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient

    cfg = settings or test_settings()
    credentials = AuthCredentialsClient(
        base_url=cfg.auth_internal_base_url,
        service_token=TEST_SERVICE_TOKEN,
        transport=auth_handler or httpx.MockTransport(default_auth_ok_handler),
    )
    laliga_client = LaligaFantasyClient(
        origin=cfg.laliga_fantasy_origin,
        transport=fantasy_handler,
    )
    return build_container(
        cfg,
        jwt_validator=StaticInternalJwtValidator(
            public_key_pem=public_pem,
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
        ),
        credentials=credentials,
        laliga_client=laliga_client,
        scraping_transport=scraping_transport,
        weather_transport=weather_transport,
    )
