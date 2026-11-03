"""Discovery remains scoped and weekly extraction cannot repeat or escape its weekday."""

# ---- Mocks, fixtures & helpers ---- #

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fantasy_api.cli import radar_sync
from fantasy_api.radar.catalog import build_inventory
from fantasy_api.radar.discovery import DiscoveryManifest, discovery_report, weekly_slot
from fantasy_api.radar.files import atomic_json, read_json
from fantasy_api.radar.registry import IdentityRegistry
from fantasy_api.radar.releases import load_release
from fantasy_api.services import radar_jobs


def weekly_args(tmp_path, **changes):
    """Build the scheduled command without external credentials."""
    flags = [
        "weekly",
        "--work-dir",
        str(tmp_path),
        "--registry",
        str(tmp_path / "registry.json"),
        "--audits",
        str(tmp_path / "audits.json"),
        "--captures",
        str(tmp_path),
        "--observations",
        str(tmp_path / "observations.json"),
        "--root",
        str(tmp_path / "published"),
        "--team-id",
        "4",
        "--team-id",
        "15",
    ]
    args = radar_sync._parser().parse_args(flags)
    for key, value in changes.items():
        setattr(args, key, value)
    return args


# ---- Happy path ---- #


def test_discovery_report_two_teams_accounts_unmatched_players_without_approval():
    catalog = build_inventory(
        [
            {"id": 1, "nickname": "Player", "teamId": 4, "positionId": 3},
            {"id": 2, "nickname": "Reserve", "teamId": 15, "positionId": 1},
            {"id": 3, "nickname": "Other", "teamId": 2, "positionId": 1},
        ],
        "2026-27",
    )
    url = "https://datamb.football/Test_Midfielder_stats1/"
    manifest = DiscoveryManifest.model_validate(
        {
            "profiles": [
                {"player_id": "1", "url": url, "evidence": [url]},
            ]
        }
    )
    registry = IdentityRegistry()
    result = discovery_report(catalog, registry, manifest, {"4", "15"})
    assert result["accounted"] == 2
    assert result["players"][0]["identity_status"] == "pending_review"
    assert result["players"][1]["discovery_status"] == "no_observed_profile"
    assert registry.records == []


@pytest.mark.parametrize("exclude_first", [False, True])
def test_weekly_success_claims_once_and_fetches_only_selected_teams(
    tmp_path, monkeypatch, exclude_first
):
    from test_radar_sync import inputs

    _, registry, audits, _, _ = inputs(tmp_path)
    raw = [
        {"id": i, "nickname": f"Player {i}", "teamId": team, "positionId": 3}
        for i, team in [(1, 4), (2, 15), (3, 2)]
    ]
    if exclude_first:
        raw[0]["playerStatus"] = "out_of_league"
    catalog = build_inventory(raw, "2026-27")
    for name, value in [("catalog", catalog), ("registry", registry), ("audits", audits)]:
        atomic_json(tmp_path / f"{name}.json", value.model_dump(mode="json"))
    atomic_json(tmp_path / "observations.json", {"profiles": []})
    monkeypatch.setattr(radar_jobs, "weekly_slot", lambda day: ("2026-W45", True))
    public = AsyncMock(return_value=raw)
    fetch = AsyncMock(return_value={"skipped_fresh": 1})
    monkeypatch.setattr(radar_sync, "_public_catalog", public)
    monkeypatch.setattr(radar_sync, "_fetch", fetch)
    args = weekly_args(tmp_path)
    if exclude_first:
        from fantasy_api.radar.eligibility import RadarEligibility

        policy = RadarEligibility(
            season="2026-27",
            competition="Test League",
            minimum_minutes=300,
            clubs={"4": ["Club"], "15": ["Club"]},
            active_player_ids=["1", "2"],
        )
        atomic_json(tmp_path / "eligibility.json", policy.model_dump(mode="json"))
        args.eligibility = tmp_path / "eligibility.json"
    result = radar_sync._weekly(args)
    assert result["status"] == "complete"
    assert args.refresh_days == 1
    assert [t.identity.player_id for t in fetch.call_args.args[1]] == (
        [] if exclude_first else ["1"]
    )
    assert radar_sync._weekly(args)["due"] is False
    public.assert_awaited_once()
    fetch.assert_awaited_once()
    assert read_json(tmp_path / "discovery.json")["accounted"] == 2


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.example/Test_stats/",
        "https://datamb.football/Test_stats/?lang=en",
        "https://datamb.football/Test_stats/../",
        "https://datamb.football/Barcelona_Team_stats/",
    ],
)
def test_discovery_manifest_untrusted_urls_rejects(url):
    with pytest.raises(ValueError):
        DiscoveryManifest.model_validate(
            {"profiles": [{"player_id": "1", "url": url, "evidence": [url]}]}
        )


def test_weekly_stale_fallback_publishes_saved_data_and_reports_partial(tmp_path, monkeypatch):
    from test_radar_sync import NOW, inputs

    _, registry, audits, _, value = inputs(tmp_path)
    raw = [
        {"id": i, "nickname": f"Player {i}", "teamId": team, "positionId": 3}
        for i, team in [(1, 4), (2, 15)]
    ]
    catalog = build_inventory(raw, "2026-27")
    for name, model in [("catalog", catalog), ("registry", registry), ("audits", audits)]:
        atomic_json(tmp_path / f"{name}.json", model.model_dump(mode="json"))
    atomic_json(tmp_path / "observations.json", {"profiles": []})
    fetched_at = NOW - timedelta(days=2)
    scraper = AsyncMock()
    scraper.get_json.return_value = value | {"fetched_at": fetched_at.isoformat(), "stale": True}
    public = AsyncMock(return_value=raw)
    monkeypatch.setattr(radar_jobs, "weekly_slot", lambda day: ("2026-W45", True))
    monkeypatch.setattr(radar_sync, "_public_catalog", public)
    monkeypatch.setattr(radar_sync, "ScrapingClient", lambda **kwargs: scraper)
    args = weekly_args(tmp_path)

    with pytest.raises(ValueError, match="refresh incomplete"):
        radar_sync._weekly(args)

    state = read_json(tmp_path / "weekly-attempt.json")
    assert state["status"] == "partial"
    assert state["fetch"] == {"cached_stale": 1}
    published = load_release(args.root)
    assert published.store.snapshots[0].fetched_at == fetched_at
    assert published.store.snapshots[0].stale
    assert published.coverage[0].last_error_code == "cached_stale"
    assert radar_sync._weekly(args)["due"] is False
    public.assert_awaited_once()
    scraper.get_json.assert_awaited_once()
    scraper.aclose.assert_awaited_once()


def test_weekly_failed_attempt_cannot_repeat_network_same_week(tmp_path, monkeypatch):
    monkeypatch.setattr(radar_jobs, "weekly_slot", lambda day: ("2026-W45", True))
    catalog = build_inventory([{"id": 1, "nickname": "Player", "positionId": 3}], "2026-27")
    atomic_json(tmp_path / "catalog.json", catalog.model_dump(mode="json"))
    public = AsyncMock(side_effect=ValueError("source unavailable"))
    monkeypatch.setattr(radar_sync, "_public_catalog", public)
    with pytest.raises(ValueError):
        radar_sync._weekly(weekly_args(tmp_path))
    assert radar_sync._weekly(weekly_args(tmp_path))["due"] is False
    public.assert_awaited_once()


# ---- Edge cases ---- #


@pytest.mark.parametrize(
    "when, expected",
    [
        (datetime(2026, 11, 3, 23, 30, tzinfo=UTC), True),
        (datetime(2026, 11, 4, 23, 30, tzinfo=UTC), False),
        (datetime(2027, 1, 3, 23, 30, tzinfo=UTC), False),
    ],
)
def test_weekly_slot_madrid_day_boundary_controls_extraction(when, expected):
    assert weekly_slot("wed", now=when)[1] is expected


def test_weekly_wrong_day_and_check_never_access_network(tmp_path, monkeypatch):
    public = AsyncMock(side_effect=AssertionError("network forbidden"))
    monkeypatch.setattr(radar_sync, "_public_catalog", public)
    monkeypatch.setattr(radar_jobs, "weekly_slot", lambda day: ("2026-W45", False))
    assert radar_sync._weekly(weekly_args(tmp_path))["due"] is False
    monkeypatch.setattr(radar_jobs, "weekly_slot", lambda day: ("2026-W45", True))
    assert radar_sync._weekly(weekly_args(tmp_path, check=True))["due"] is True
    assert not (tmp_path / "weekly-attempt.json").exists()
    public.assert_not_called()
