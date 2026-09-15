# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import httpx
import pytest
from fantasy_auth.adapters.fantasy_httpx import HttpxFantasyClient
from fantasy_auth.domain.errors import ProviderError

ORIGIN = "https://fantasy-api.llt-services.com"


def make_client(transport: httpx.AsyncBaseTransport) -> HttpxFantasyClient:
    return HttpxFantasyClient(origin=ORIGIN, transport=transport)


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_get_current_user_200_returns_json() -> None:
    # Arrange
    profile = {"id": "mgr-1", "managerName": "El Manager"}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v4/user/me"
        assert request.headers["Authorization"] == "Bearer tok-1"
        assert request.headers["Accept"] == "application/json"
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json=profile)

    client = make_client(httpx.MockTransport(handler))

    # Act
    result = await client.get_current_user("tok-1")

    # Assert
    assert result == profile


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_get_current_user_401_raises_fantasy_unauthorized() -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    client = make_client(httpx.MockTransport(handler))

    # Act / Assert
    with pytest.raises(ProviderError) as exc:
        await client.get_current_user("bad-tok")
    assert exc.value.category == "fantasy_unauthorized"
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_500_raises_fantasy_error() -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    client = make_client(httpx.MockTransport(handler))

    # Act / Assert
    with pytest.raises(ProviderError) as exc:
        await client.get_current_user("tok-1")
    assert exc.value.category == "fantasy_error"
    assert exc.value.status_code == 500
