# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import httpx
import pytest
from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.domain.errors import UpstreamError
from pydantic import SecretStr

# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_get_json_success_sends_service_token() -> None:
    seen: dict[str, str] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["token"] = request.headers.get("X-Service-Token", "")
        return httpx.Response(200, json={"ok": True})

    client = ScrapingClient(
        base_url="http://scraping.test",
        service_token=SecretStr("scraping-token"),
        timeout_seconds=5.0,
        transport=httpx.MockTransport(handler),
    )
    payload = await client.get_json("/internal/players/futbolfantasy", {"player_name": "a"})
    await client.aclose()
    assert payload == {"ok": True}
    assert seen["token"] == "scraping-token"


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_get_json_disabled_raises_scraping_disabled() -> None:
    client = ScrapingClient(
        base_url="",
        service_token=SecretStr(""),
        timeout_seconds=5.0,
    )
    with pytest.raises(UpstreamError) as exc:
        await client.get_json("/internal/players/futbolfantasy", {})
    assert exc.value.category == "scraping_disabled"
