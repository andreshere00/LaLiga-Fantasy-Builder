"""Capture commands preserve source evidence without approving or publishing it."""

from argparse import Namespace
from unittest.mock import AsyncMock

import pytest
from fantasy_api.cli import radar_sync
from fantasy_api.radar.files import content_id, read_json
from test_radar_audits import capture

# ---- Mocks, fixtures & helpers ---- #


def args(tmp_path, **changes):
    """Build a capture invocation with a canonical observed source key."""
    return Namespace(
        **(
            {
                "profile_key": "Test_Midfielder_stats",
                "season": "2026-27",
                "output": tmp_path / "capture.json",
            }
            | changes
        )
    )


# ---- Happy path ---- #


async def test_capture_valid_response_saves_hash_bound_evidence(tmp_path, monkeypatch):
    client = AsyncMock()
    client.get_json.return_value = capture()
    monkeypatch.setattr(radar_sync, "ScrapingClient", lambda **kwargs: client)
    result = await radar_sync._capture(args(tmp_path))
    value = read_json(tmp_path / "capture.json")
    assert result["capture_hash"] == content_id(value)
    client.get_json.assert_awaited_once_with(
        "/internal/radar/datamb",
        {"profile_key": "Test_Midfielder_stats", "season": "2026-27"},
    )
    client.aclose.assert_awaited_once()
    assert list(tmp_path.iterdir()) == [tmp_path / "capture.json"]


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "changes",
    [
        {"profile_key": "https://evil.example/"},
        {"season": "2026-28"},
    ],
)
async def test_capture_invalid_input_never_creates_client(tmp_path, monkeypatch, changes):
    def forbidden(**kwargs):
        raise AssertionError("invalid inputs must fail before network access")

    monkeypatch.setattr(radar_sync, "ScrapingClient", forbidden)
    with pytest.raises(ValueError):
        await radar_sync._capture(args(tmp_path, **changes))


async def test_capture_invalid_response_closes_client_without_writing(tmp_path, monkeypatch):
    client = AsyncMock()
    client.get_json.return_value = capture() | {"season": "2025-26"}
    monkeypatch.setattr(radar_sync, "ScrapingClient", lambda **kwargs: client)
    with pytest.raises(ValueError, match="season"):
        await radar_sync._capture(args(tmp_path))
    client.aclose.assert_awaited_once()
    assert not (tmp_path / "capture.json").exists()


# ---- Edge cases ---- #


async def test_capture_existing_evidence_is_preserved(tmp_path):
    output = tmp_path / "capture.json"
    output.write_text("original evidence")
    with pytest.raises(ValueError, match="already exists"):
        await radar_sync._capture(args(tmp_path))
    assert output.read_text() == "original evidence"
