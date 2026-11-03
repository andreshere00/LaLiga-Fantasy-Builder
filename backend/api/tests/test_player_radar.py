"""Radar contracts, source isolation and comparison rules."""

# ---- Mocks, fixtures & helpers ---- #

import json
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from fantasy_api.api.deps import build_container
from fantasy_api.config import Settings
from fantasy_api.domain.errors import UnauthorizedError
from fantasy_api.main import create_app
from fantasy_api.radar.profiles import PROFILES
from fantasy_api.schemas.player_radar import RadarSnapshot, RadarStore
from fantasy_api.services.player_radar import build_radar
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

AUTH = {"Authorization": "Bearer app-token"}
URL = "/players/1/stats/radar?season=2026-27"
NOW = datetime.now(UTC)


class Validator:
    """Use verified sub without touching LaLiga credentials."""

    def validate(self, token: str) -> dict:
        if token != "app-token":
            raise UnauthorizedError()
        return {"sub": "radar-user"}


def snapshot(player_id="1", profile="midfielder_v1", **changes) -> RadarSnapshot:
    """Build an explicitly synthetic documented population."""
    data = dict(
        player_id=player_id,
        player=f"Player {player_id}",
        club="Test Club",
        age=23,
        season="2026-27",
        competition="laliga",
        period="season",
        minutes=769,
        profile=profile,
        source="imported",
        method="test-percentiles",
        recipe_version="v1",
        snapshot_id="snapshot",
        fetched_at=NOW,
        cohort={
            "id": "midfielders",
            "label": "Test population",
            "reference_snapshot": "reference-v1",
            "eligibility": "at least 300 minutes",
            "size": 100,
            "minimum_minutes": 300,
        },
        percentiles={
            key: float(index * 10) for index, (key, _, _) in enumerate(PROFILES[profile].metrics)
        },
    )
    data.update(changes)
    return RadarSnapshot.model_validate(data)


def app_client(tmp_path: Path, rows=(), *, mappings=(), handler=None, raw=None):
    """Configure explicit storage; all HTTP remains deterministic MockTransport."""
    from fantasy_api.radar.catalog import CatalogEntry, CatalogInventory
    from fantasy_api.radar.coverage import RadarCoverage
    from fantasy_api.radar.files import atomic_json, content_id
    from fantasy_api.radar.releases import PublishedDataset
    from fantasy_api.radar.views import comparison_index

    entries = [
        CatalogEntry(player_id=id, name=f"Player {id}", club="Test Club")
        for id in sorted({r.player_id for r in rows} or {"1"})
    ]
    catalog = CatalogInventory(
        snapshot_id=content_id([p.model_dump() for p in entries]),
        season="2026-27",
        fetched_at=NOW,
        players=entries,
    )
    coverage = [
        RadarCoverage(
            player_id=p.player_id,
            season=catalog.season,
            identity_status="matched",
            data_status="ready" if rows else "not_published",
            reason_code="ready" if rows else "not_published",
            dataset_id="test",
            catalog_snapshot_id=catalog.snapshot_id,
            available_profiles=[r.profile for r in rows if r.player_id == p.player_id],
        )
        for p in entries
    ]
    dataset = PublishedDataset(
        catalog=catalog,
        store=RadarStore(snapshots=list(rows)),
        coverage=coverage,
        index=comparison_index(list(rows)),
        report={
            "dataset_id": "test",
            "accounted": len(entries),
            "catalog_snapshot_id": catalog.snapshot_id,
        },
    )
    # Exercise backwards-compatible reads of a frozen pre-provenance release.
    values = dataset.files()
    values.pop("provenance.json")
    hashes = {name: content_id(value) for name, value in values.items()}
    release_id = content_id(hashes)
    directory = tmp_path / "releases" / release_id
    for name, value in values.items():
        atomic_json(directory / name, value)
    atomic_json(directory / "manifest.json", {"release_id": release_id, "files": hashes})
    atomic_json(tmp_path / "current.json", {"release_id": release_id})
    if raw is not None:
        (tmp_path / "current.json").write_text(raw)
    cfg = Settings(
        _env_file=None,
        radar_dataset_root=str(tmp_path),
        scraping_base_url="http://private",
        scraping_service_token=SecretStr("private-service-secret"),
    )

    def reject(request):
        raise AssertionError(f"Unexpected network request: {request.url.path}")

    container = build_container(
        settings=cfg,
        jwt_validator=Validator(),
        scraping_transport=httpx.MockTransport(handler or reject),
    )
    return TestClient(create_app(settings=cfg, container=container))


# ---- Happy path ---- #


def test_get_radar_documented_players_compares_without_laliga(tmp_path):
    with app_client(tmp_path, [snapshot(), snapshot("2")]) as client:
        response = client.get(URL + "&profile=midfielder_v1&compare_player_id=2", headers=AUTH)
    assert response.status_code == 200
    data = response.json()
    assert data["comparison"]["player_id"] == "2"
    assert data["compatible_players"] == [
        {"player_id": "2", "player": "Player 2", "club": "Test Club", "profile": "midfielder_v1"}
    ]
    assert data["radars"][0]["axes"][0]["percentile"] == 0
    assert len(data["radars"][0]["axes"]) == 7
    assert response.headers["vary"] == "Authorization"


@pytest.mark.parametrize("profile", PROFILES)
def test_build_radar_profile_keeps_seven_axes_and_context_separate(profile):
    record = build_radar(snapshot(profile=profile, cohort=None))
    assert [a.key for a in record.axes] == [key for key, _, _ in PROFILES[profile].metrics]
    assert record.minutes == 769
    assert all("minutes" not in axis.key for axis in record.axes)
    assert record.comparison_key is None
    assert record.position == PROFILES[profile].position


# ---- Error paths ---- #


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer invalid"}])
def test_get_radar_missing_or_invalid_jwt_fails_before_storage(tmp_path, headers):
    with app_client(tmp_path, raw="unreadable") as client:
        assert client.get(URL, headers=headers).status_code == 401


@pytest.mark.parametrize(
    "raw", ["<html>secret</html>", "{}", '{"snapshots":[{"secret":"provider"}]}']
)
def test_get_radar_invalid_storage_returns_sanitized_502(tmp_path, raw):
    with app_client(tmp_path, raw=raw) as client:
        response = client.get(URL, headers=AUTH)
    assert response.status_code == 502
    assert "secret" not in response.text and str(tmp_path) not in response.text


@pytest.mark.parametrize("suffix", ["&unknown=x", "&profile=other", "&compare_player_id=bad"])
def test_get_radar_invalid_query_rejects_before_source(tmp_path, suffix):
    with app_client(tmp_path) as client:
        assert client.get(URL + suffix, headers=AUTH).status_code == 422


@pytest.mark.parametrize("season", ["2026-28", "26/27", "nan"])
def test_get_radar_invalid_season_rejects_before_source(tmp_path, season):
    with app_client(tmp_path) as client:
        assert client.get(URL.replace("2026-27", season), headers=AUTH).status_code == 422


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1, 101, True])
def test_snapshot_invalid_percentile_rejects_corruption(value):
    data = snapshot().model_dump()
    data["percentiles"]["duel_win_pct"] = value
    with pytest.raises(ValidationError):
        RadarSnapshot.model_validate(data)


@pytest.mark.parametrize(
    "change",
    [
        {"source": "application"},
        {"recipe_version": "v2"},
        {"cohort": None},
        {"period": "last-five"},
        {"competition": "other"},
        {"profile": "attacker_winger_v1"},
    ],
)
def test_get_radar_incompatible_context_never_overlays(tmp_path, change):
    with app_client(tmp_path, [snapshot(), snapshot("2", **change)]) as client:
        data = client.get(URL + "&profile=midfielder_v1&compare_player_id=2", headers=AUTH).json()
    assert data["comparison"] is None
    assert data["comparison_reason"]
    assert data["radars"]


# ---- Edge cases ---- #


def test_build_radar_missing_axis_stays_null_and_blocks_comparison():
    data = snapshot().model_dump()
    data["percentiles"]["duel_win_pct"] = None
    record = build_radar(RadarSnapshot.model_validate(data))
    assert record.axes[0].percentile is None
    assert record.axes[0].status == "not_published"
    assert record.comparison_key is None


def test_build_radar_insufficient_minutes_blocks_comparison():
    record = build_radar(snapshot(minutes=200))
    assert record.comparison_key is None
    assert "Insufficient minutes" in record.comparison_reason


def test_get_radar_absent_player_does_not_substitute_sample_data(tmp_path):
    with app_client(tmp_path) as client:
        data = client.get(URL, headers=AUTH).json()
    assert data["status"] == "unavailable"
    assert data["radars"] == []


def test_store_duplicate_or_mislabelled_profiles_rejects_ambiguous_data():
    data = snapshot().model_dump()
    with pytest.raises(ValidationError):
        RadarStore(snapshots=[data, deepcopy(data)])
    data["profile"] = "defense_fullback_v1"
    with pytest.raises(ValidationError):
        RadarSnapshot.model_validate(data)


def test_build_radar_extra_input_cannot_override_derived_fields():
    data = snapshot(cohort=None).model_dump()
    data.update(comparison_key="forged", position="Attacker", axes=[{"percentile": 100}])
    record = build_radar(RadarSnapshot.model_validate(data))
    assert record.comparison_key is None
    assert record.position == "Midfielder"
    assert len(record.axes) == 7


def test_radar_cli_valid_selection_uses_shared_auth_and_query(monkeypatch, capsys):
    from fantasy_api.cli import player_stats

    seen = []
    monkeypatch.setattr(player_stats, "resolve_jwt", lambda *a, **kw: "app-token")

    def get(base, path, token, *, params=None):
        seen.append((path, token, params))
        return {"status": "unavailable"}

    monkeypatch.setattr(player_stats, "api_get", get)
    code = player_stats.main(
        [
            "--player-id",
            "1",
            "--segment",
            "radar",
            "--season",
            "2026-27",
            "--profile",
            "midfielder_v1",
            "--compare-player-id",
            "2",
            "--json",
        ]
    )
    assert code == 0
    assert seen == [
        (
            "/players/1/stats/radar",
            "app-token",
            {
                "season": "2026-27",
                "profile": "midfielder_v1",
                "compare_player_id": "2",
            },
        )
    ]
    assert "unavailable" in capsys.readouterr().out


def test_radar_cli_invalid_season_fails_before_login(monkeypatch):
    from fantasy_api.cli import player_stats

    def forbidden(*args, **kwargs):
        raise AssertionError("must not authenticate")

    monkeypatch.setattr(player_stats, "resolve_jwt", forbidden)
    assert player_stats.main(["--player-id", "1", "--segment", "radar", "--season", "2026-28"]) == 2


def test_profiles_shared_fixture_matches_server_registry():
    path = Path(__file__).resolve().parents[3] / "frontend/test/fixtures/player-radars.json"
    examples = json.loads(path.read_text())
    assert [row["profile"] for row in examples] == list(PROFILES)
    for row in examples:
        definition = PROFILES[row["profile"]]
        assert row["position"] == definition.position
        assert [(axis["key"], axis["label"], axis["definition"]) for axis in row["axes"]] == list(
            definition.metrics
        )


def test_build_radar_different_source_definitions_never_share_comparison_key():
    first = snapshot()
    second = snapshot(
        "2",
        source_metrics={
            key: "different-source-definition:" + key
            for key, _, _ in PROFILES["midfielder_v1"].metrics
        },
    )
    assert build_radar(first).comparison_key != build_radar(second).comparison_key


def test_build_radar_provider_stale_preserves_original_timestamp():
    record = build_radar(snapshot(stale=True), now=NOW)
    assert record.stale is True
    assert record.fetched_at == NOW
