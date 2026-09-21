"""Shared wired ``AppContainer`` factory for API integration tests."""

from __future__ import annotations

import time

import httpx
from fantasy_api.api.deps import AppContainer
from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import Settings
from fantasy_api.repositories.calendar import CalendarRepository
from fantasy_api.repositories.leagues import LeaguesRepository
from fantasy_api.repositories.market import MarketRepository
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.repositories.teams import TeamsRepository
from fantasy_api.security.internal_jwt import StaticInternalJwtValidator
from fantasy_api.services.calendar import CalendarService
from fantasy_api.services.leagues import LeaguesService
from fantasy_api.services.market import MarketService
from fantasy_api.services.players import PlayersService
from fantasy_api.services.teams import TeamsService
from jwt_mint import DEFAULT_TEST_AUDIENCE, DEFAULT_TEST_ISSUER

TEST_ISSUER = DEFAULT_TEST_ISSUER
TEST_AUDIENCE = DEFAULT_TEST_AUDIENCE
TEST_SERVICE_TOKEN = "api-service-token"
TEST_FANTASY_ORIGIN = "https://fantasy.test"
TEST_LALIGA_BEARER = "laliga-secret-token"


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


def default_auth_ok_handler(request: httpx.Request) -> httpx.Response:
    """Return a mock LaLiga bearer from the auth credentials client."""
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


def build_test_container(
    public_pem: str,
    *,
    auth_handler: httpx.MockTransport | None = None,
    fantasy_handler: httpx.MockTransport | None = None,
) -> AppContainer:
    """Wire a full ``AppContainer`` for HTTP integration tests.

    Args:
        public_pem: RSA public key PEM for internal JWT validation.
        auth_handler: Optional mock transport for ``AuthCredentialsClient``.
        fantasy_handler: Optional mock transport for ``LaligaFantasyClient``.

    Returns:
        Process-lifetime container with all domain services registered.
    """
    settings = test_settings()
    credentials = AuthCredentialsClient(
        base_url=settings.auth_internal_base_url,
        service_token=TEST_SERVICE_TOKEN,
        transport=auth_handler or httpx.MockTransport(default_auth_ok_handler),
    )
    laliga_client = LaligaFantasyClient(
        origin=settings.laliga_fantasy_origin,
        transport=fantasy_handler,
    )
    competition_id = settings.laliga_competition_id
    return AppContainer(
        settings=settings,
        jwt_validator=StaticInternalJwtValidator(
            public_key_pem=public_pem,
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
        ),
        credentials=credentials,
        laliga_client=laliga_client,
        leagues_service=LeaguesService(
            credentials,
            LeaguesRepository(laliga_client, competition_id=competition_id),
        ),
        teams_service=TeamsService(
            credentials,
            TeamsRepository(laliga_client, competition_id=competition_id),
        ),
        calendar_service=CalendarService(
            CalendarRepository(laliga_client, competition_id=competition_id),
        ),
        players_service=PlayersService(
            credentials,
            PlayersRepository(laliga_client, competition_id=competition_id),
        ),
        market_service=MarketService(
            credentials,
            MarketRepository(laliga_client, competition_id=competition_id),
        ),
    )
