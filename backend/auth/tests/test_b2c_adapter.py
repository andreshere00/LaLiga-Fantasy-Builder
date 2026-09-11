# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from fantasy_auth.adapters.b2c_httpx import HttpxB2CClient
from fantasy_auth.adapters.pkce import generate_verifier, s256_challenge
from fantasy_auth.domain.errors import InvalidGrant, ProviderError

CLIENT_ID = "af88bcff-1157-40a0-b579-030728aacf0b"
POLICY = "B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN"
TOKEN_URL = (
    "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token"
)
AUTHORIZE_URL = (
    "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/authorize"
)
NOW = 1_700_000_000


def make_client(transport: httpx.AsyncBaseTransport | None = None) -> HttpxB2CClient:
    return HttpxB2CClient(
        client_id=CLIENT_ID,
        signin_policy=POLICY,
        token_base_url=TOKEN_URL,
        authorize_url=AUTHORIZE_URL,
        clock_now=lambda: NOW,
        transport=transport,
    )


# ---- Happy path ---- #


def test_build_authorize_url_targets_b2c_with_pkce_params() -> None:
    # Arrange
    client = make_client()

    # Act
    url = client.build_authorize_url(
        redirect_uri="authredirect://com.lfp.laligafantasy",
        code_challenge="challenge123",
        state="state456",
    )
    parsed = urlparse(url)
    params = parse_qs(parsed.query)

    # Assert
    assert parsed.hostname == "login.laliga.es"
    assert parsed.path.endswith("/oauth2/v2.0/authorize")
    assert params["response_type"] == ["code"]
    assert params["code_challenge"] == ["challenge123"]
    assert params["code_challenge_method"] == ["S256"]
    assert params["p"] == [POLICY]
    assert params["scope"] == ["openid offline_access"]
    assert params["redirect_uri"] == ["authredirect://com.lfp.laligafantasy"]
    assert params["state"] == ["state456"]
    assert params["nonce"] == ["state456"]


@pytest.mark.asyncio
async def test_exchange_code_posts_authorization_code_and_tags_client() -> None:
    # Arrange
    token_response = {
        "access_token": "a",
        "id_token": "b",
        "refresh_token": "c",
        "token_type": "Bearer",
        "expires_in": 3600,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert f"p={POLICY}" in str(request.url)
        body = parse_qs(request.content.decode())
        assert body["grant_type"] == ["authorization_code"]
        assert body["code"] == ["the-code"]
        assert body["code_verifier"] == ["the-verifier"]
        assert body["redirect_uri"] == ["authredirect://com.lfp.laligafantasy"]
        return httpx.Response(200, json=token_response)

    client = make_client(httpx.MockTransport(handler))

    # Act
    result = await client.exchange_code(
        code="the-code",
        code_verifier="the-verifier",
        redirect_uri="authredirect://com.lfp.laligafantasy",
    )

    # Assert
    assert result.access_token == "a"
    assert result.client_id == CLIENT_ID
    assert result.policy == POLICY
    assert result.scope == "openid offline_access"


def test_s256_challenge_is_deterministic() -> None:
    # Arrange
    verifier = "test-verifier-value"

    # Act
    challenge = s256_challenge(verifier)

    # Assert
    assert challenge == s256_challenge(verifier)
    assert generate_verifier() != generate_verifier()


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_exchange_code_raises_with_b2c_error_description() -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={"error": "invalid_grant", "error_description": "bad code"},
        )

    client = make_client(httpx.MockTransport(handler))

    # Act / Assert
    with pytest.raises(InvalidGrant, match="bad code"):
        await client.exchange_code(code="x", code_verifier="y", redirect_uri="z")


@pytest.mark.asyncio
async def test_refresh_uses_issuing_policy_and_scope() -> None:
    # Arrange
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        body = parse_qs(request.content.decode())
        seen["policy"] = parse_qs(urlparse(str(request.url)).query)["p"][0]
        seen["scope"] = body["scope"][0]
        seen["client_id"] = body["client_id"][0]
        return httpx.Response(
            200,
            json={"access_token": "new", "expires_in": 100, "id_token": "nid"},
        )

    client = make_client(httpx.MockTransport(handler))

    # Act
    await client.refresh(
        refresh_token="r",
        client_id=CLIENT_ID,
        policy=POLICY,
        scope="openid offline_access",
    )

    # Assert
    assert seen["policy"] == POLICY
    assert seen["scope"] == "openid offline_access"
    assert seen["client_id"] == CLIENT_ID


# ---- Edge cases ---- #


@pytest.mark.asyncio
async def test_refresh_invalid_grant_maps_to_invalid_grant() -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={
                "error": "invalid_grant",
                "error_description": "AADB2C90088: expired",
            },
        )

    client = make_client(httpx.MockTransport(handler))

    # Act / Assert
    with pytest.raises(InvalidGrant):
        await client.refresh(
            refresh_token="r",
            client_id=CLIENT_ID,
            policy=POLICY,
            scope="openid offline_access",
        )


@pytest.mark.asyncio
async def test_exchange_code_provider_error_on_missing_tokens() -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"token_type": "Bearer"})

    client = make_client(httpx.MockTransport(handler))

    # Act / Assert
    with pytest.raises(ProviderError):
        await client.exchange_code(code="c", code_verifier="v", redirect_uri="r")
