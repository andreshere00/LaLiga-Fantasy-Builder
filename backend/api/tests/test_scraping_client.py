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


@pytest.mark.asyncio
async def test_get_json_identity_conflict_preserves_safe_category_without_raw_body() -> None:
    client = ScrapingClient(
        base_url="http://scraping.test",
        service_token=SecretStr("scraping-token"),
        timeout_seconds=5.0,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                409, json={"error": "player_ambiguous", "detail": "private-upstream-body"}
            )
        ),
    )
    async with client._http:
        with pytest.raises(UpstreamError) as exc:
            await client.get_json("/internal/players/futbolfantasy", {"player_name": "Carvajal"})
    assert exc.value.category == "player_ambiguous"
    assert exc.value.status_code == 409
    assert "private-upstream-body" not in str(exc.value)


@pytest.mark.parametrize(
    "status,code,provider_status,category",
    [
        (503, "upstream_rate_limited", 429, "radar_source_unavailable"),
        (503, "upstream_blocked", 403, "radar_source_unavailable"),
        (403, "robots_disallowed", 403, "radar_source_unavailable"),
        (502, "unexpected_content", 502, "radar_source_invalid"),
        (404, "unknown", 404, "radar_source_unavailable"),
    ],
)
async def test_get_json_radar_errors_preserve_safe_operational_status(
    status,
    code,
    provider_status,
    category,
):
    client = ScrapingClient(
        base_url="http://private",
        service_token=SecretStr("private-token"),
        timeout_seconds=5,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                status, json={"error": code, "detail": "private-upstream-body"}
            )
        ),
    )
    try:
        with pytest.raises(UpstreamError) as error:
            await client.get_json("/internal/radar/datamb", {"profile_key": "Test_stats"})
        assert error.value.category == category
        assert error.value.provider_status == provider_status
        assert "private-upstream-body" not in str(error.value)
    finally:
        await client.aclose()
