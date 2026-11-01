"""Local dataset reads are pinned, authenticated and stable across worker restarts."""

# ---- Mocks, fixtures & helpers ---- #

from datetime import timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from fantasy_api.api.deps import build_container
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import Settings
from fantasy_api.main import create_app
from fantasy_api.radar.files import atomic_json
from fantasy_api.radar.registry import IdentityRegistry
from fantasy_api.radar.releases import publish_release
from fantasy_api.repositories.player_radar import PlayerRadarRepository
from fantasy_api.schemas.player_radar import RadarQuery, RadarStore
from fantasy_api.services.player_radar import PlayerRadarService
from fantasy_api.services.radar_sync import compile_dataset, fetch_tasks
from fastapi.testclient import TestClient
from test_player_radar import AUTH, URL, Validator, snapshot
from test_radar_sync import NOW, tasks_for


async def published(tmp_path):
    """Publish two explicitly synthetic compatible observations."""
    catalog, registry, tasks, imported, _ = tasks_for(tmp_path, "imported")
    cohort = snapshot().cohort
    role = tasks[0].role.model_copy(update={"cohort": cohort})
    first = tasks[0].identity.model_copy(update={"roles": [role]})
    second = first.model_copy(
        update={"player_id": "2", "expected_name": "Player 2", "source_key": "Other_import_stats"}
    )
    registry = IdentityRegistry(records=[first, second])
    tasks = [
        tasks[0].model_copy(update={"identity": identity, "role": role})
        for identity in registry.records
    ]
    imports = [
        imported.model_copy(
            update={
                "cohort": cohort,
                "player_id": identity.player_id,
                "player": identity.expected_name,
            }
        )
        for identity in registry.records
    ]
    await fetch_tasks(tasks, tmp_path, AsyncMock(), imports=RadarStore(snapshots=imports), now=NOW)
    dataset = compile_dataset(catalog, registry, tasks, tmp_path, now=NOW)
    root = tmp_path / "published"
    publish_release(root, dataset)
    return root, dataset


def client_for(root):
    """Configure a new worker; any network call fails the test."""
    settings = Settings(_env_file=None, radar_dataset_root=str(root))

    def reject(request):
        raise AssertionError(f"Unexpected network request {request.url.path}")

    container = build_container(
        settings=settings,
        jwt_validator=Validator(),
        scraping_transport=httpx.MockTransport(reject),
        laliga_client=LaligaFantasyClient(
            origin="https://test.example", transport=httpx.MockTransport(reject)
        ),
    )
    return TestClient(create_app(settings=settings, container=container))


# ---- Happy path ---- #


async def test_get_radar_published_restart_keeps_candidates_and_never_scrapes(tmp_path):
    root, dataset = await published(tmp_path)
    for _ in range(2):
        with client_for(root) as client:
            result = client.get(URL + "&profile=midfielder_v1&compare_player_id=2", headers=AUTH)
        assert result.status_code == 200, result.text
        body = result.json()
        assert body["coverage"]["data_status"] == "ready"
        assert body["default_profile"] == "midfielder_v1"
        assert body["compatible_players"][0]["club"] == "Test Club"
        assert body["comparison"]["player_id"] == "2"
        assert body["coverage"]["catalog_snapshot_id"] == dataset.catalog.snapshot_id


async def test_get_radar_publication_during_request_keeps_primary_and_comparison_together(
    tmp_path, monkeypatch
):
    root, dataset = await published(tmp_path)
    repository = PlayerRadarRepository("", AsyncMock(), dataset_root=str(root))
    original = PlayerRadarRepository.get_snapshots

    async def swap(self, player_id, season, profile):
        result = await original(self, player_id, season, profile)
        if player_id == "1":
            # Simulate a publication between primary and comparison reads.
            atomic_json(root / "current.json", {"release_id": "0" * 64})
        return result

    monkeypatch.setattr(PlayerRadarRepository, "get_snapshots", swap)
    result = await PlayerRadarService(repository).get_radar(
        "1", RadarQuery(season="2026-27", profile="midfielder_v1", compare_player_id="2")
    )
    assert result.comparison.player_id == "2"
    assert result.radars[0].comparison_key == result.comparison.comparison_key


# ---- Error paths ---- #


def test_get_radar_invalid_release_is_operational_error_not_empty_coverage(tmp_path):
    atomic_json(tmp_path / "current.json", {"release_id": "../escape"})
    with client_for(tmp_path) as client:
        assert client.get(URL).status_code == 401
        result = client.get(URL, headers=AUTH)
    assert result.status_code == 502
    assert str(tmp_path) not in result.text


def test_settings_competing_store_modes_rejects():
    with pytest.raises(ValueError, match="exclusive"):
        Settings(_env_file=None, radar_store_path="manual.json", radar_dataset_root="published")
    with pytest.raises(ValueError, match="threshold"):
        Settings(_env_file=None, radar_stale_days=30, radar_maximum_days=8)


# ---- Edge cases ---- #


async def test_get_radar_absent_season_and_coach_have_explicit_reasons(tmp_path):
    root, _ = await published(tmp_path)
    with client_for(root) as client:
        season = client.get(URL.replace("2026-27", "2025-26"), headers=AUTH).json()
        unknown = client.get(URL.replace("/1/", "/99/"), headers=AUTH).json()
    assert season["status"] == "unavailable"
    assert season["coverage"]["reason_code"] == "season_unavailable"
    assert season["available_seasons"] == ["2026-27"]
    assert unknown["coverage"]["reason_code"] == "out_of_scope"


async def test_get_radar_expired_between_jobs_stops_serving_without_freshness_reset(tmp_path):
    root, dataset = await published(tmp_path)
    for row in dataset.store.snapshots:
        row.fetched_at = NOW - timedelta(days=31)
    # Coverage records its original last success; expiration is evaluated on GET.
    publish_release(root, dataset)
    with client_for(root) as client:
        result = client.get(URL, headers=AUTH).json()
    assert result["status"] == "unavailable"
    assert result["coverage"]["reason_code"] == "expired"
    assert result["coverage"]["last_success_at"] is not None
    assert result["compatible_players"] == []
