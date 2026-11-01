"""Operational pipeline invariants: approvals, resume, atomic promotion and rollback."""

# ---- Mocks, fixtures & helpers ---- #

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.radar.audits import SupplyAudits
from fantasy_api.radar.catalog import build_inventory
from fantasy_api.radar.files import atomic_json, content_id, read_json
from fantasy_api.radar.registry import IdentityRegistry
from fantasy_api.radar.releases import (
    load_release,
    publish_release,
    publisher_lock,
    rollback_release,
)
from fantasy_api.schemas.player_radar import RadarStore
from fantasy_api.services.radar_sync import (
    compile_dataset,
    fetch_tasks,
    plan_tasks,
    semantic_snapshot_id,
)
from test_player_radar import snapshot
from test_radar_audits import audit, capture
from test_radar_registry import decision

NOW = datetime.now(UTC)


def inputs(tmp_path, provider="datamb", *, players=2):
    """Synthetic approved pipeline; fixture hashes never approve a real source."""
    catalog = build_inventory(
        [{"id": i, "nickname": f"Player {i}", "positionId": 3} for i in range(1, players + 1)],
        "2026-27",
    )
    value = capture() | {"name": "Player 1", "fetched_at": NOW.isoformat()}
    labels = value["metric_labels"]
    imported = snapshot(
        source_metrics=dict(zip(audit().metric_keys, labels, strict=True)),
        cohort=None,
        recipe_version="test-v1",
        fetched_at=NOW,
    )
    if provider == "imported":
        value = imported.model_dump(mode="json")
    approved = audit(provider=provider, capture_hash=content_id(value))
    atomic_json(tmp_path / "midfielder_v1.json", value)
    role = dict(
        profile="midfielder_v1",
        default=True,
        audit_id="midfielder_v1",
        evidence="https://datamb.football/Test_Midfielder_stats/",
        reviewed_at=NOW.isoformat(),
        reviewer="Operator",
    )
    identity = decision(provider=provider, expected_name="Player 1", roles=[role])
    registry = IdentityRegistry(records=[identity])
    audits = SupplyAudits(audits=[approved])
    return catalog, registry, audits, imported, value


def tasks_for(tmp_path, provider="datamb"):
    catalog, registry, audits, imported, value = inputs(tmp_path, provider)
    tasks = plan_tasks(catalog, registry, audits, tmp_path)
    return catalog, registry, tasks, imported, value


# ---- Happy path ---- #


async def test_fetch_tasks_source_checkpoint_resume_and_stable_content_id(tmp_path):
    catalog, registry, tasks, _, value = tasks_for(tmp_path)
    scraper = AsyncMock()
    scraper.get_json.return_value = value
    assert await fetch_tasks(tasks, tmp_path, scraper, now=NOW) == {"success": 1}
    assert await fetch_tasks(tasks, tmp_path, scraper, now=NOW) == {"skipped_fresh": 1}
    scraper.get_json.assert_awaited_once_with(
        "/internal/radar/datamb", {"profile_key": "Test_Midfielder_stats", "season": "2026-27"}
    )
    dataset = compile_dataset(catalog, registry, tasks, tmp_path, now=NOW)
    assert dataset.report["accounted"] == 2
    assert dataset.report["ready"] == 1
    assert dataset.coverage[1].reason_code == "identity_pending"
    first = dataset.store.snapshots[0]
    assert first.snapshot_id == semantic_snapshot_id(
        first.model_copy(update={"fetched_at": NOW + timedelta(days=1), "stale": True})
    )
    assert first.percentiles["duel_win_pct"] == 0


async def test_publish_release_import_survives_restart_and_rollback(tmp_path):
    catalog, registry, tasks, imported, _ = tasks_for(tmp_path, "imported")
    scraper = AsyncMock()
    await fetch_tasks(tasks, tmp_path, scraper, imports=RadarStore(snapshots=[imported]), now=NOW)
    scraper.get_json.assert_not_called()
    dataset = compile_dataset(catalog, registry, tasks, tmp_path, now=NOW)
    root = tmp_path / "published"
    first = publish_release(root, dataset)
    assert publish_release(root, dataset) == first
    assert load_release(root).store.snapshots[0].player_id == "1"
    old = compile_dataset(catalog, registry, tasks, tmp_path, now=NOW + timedelta(days=31))
    second = publish_release(root, old)
    assert first != second
    assert load_release(root).coverage[0].reason_code == "expired"
    rollback_release(root, first)
    assert load_release(root).report["ready"] == 1
    assert len(list((root / "releases").iterdir())) == 2


async def test_fetch_tasks_failed_refresh_preserves_original_timestamp(tmp_path):
    catalog, registry, tasks, _, value = tasks_for(tmp_path)
    scraper = AsyncMock()
    scraper.get_json.return_value = value
    await fetch_tasks(tasks, tmp_path, scraper, now=NOW)
    scraper.get_json.side_effect = UpstreamError("not returned", provider_status=429)
    result = await fetch_tasks(tasks, tmp_path, scraper, now=NOW + timedelta(days=9))
    assert result == {"source_unavailable": 1, "429": 1, "batch_stopped": 1}
    dataset = compile_dataset(catalog, registry, tasks, tmp_path, now=NOW + timedelta(days=9))
    assert dataset.store.snapshots[0].fetched_at == NOW
    assert dataset.store.snapshots[0].stale
    assert dataset.coverage[0].last_error_code == "source_unavailable"


async def test_compile_dataset_cohort_index_persists_compatible_candidates(tmp_path):
    catalog, registry, tasks, imported, _ = tasks_for(tmp_path, "imported")
    cohort = snapshot().cohort
    role = registry.records[0].roles[0].model_copy(update={"cohort": cohort})
    identity = registry.records[0].model_copy(update={"roles": [role]})
    registry = IdentityRegistry(records=[identity])
    task = tasks[0].model_copy(update={"identity": identity, "role": role})
    imported = imported.model_copy(update={"cohort": cohort})
    await fetch_tasks(
        [task], tmp_path, AsyncMock(), imports=RadarStore(snapshots=[imported]), now=NOW
    )
    dataset = compile_dataset(catalog, registry, [task], tmp_path, now=NOW)
    assert list(dataset.index.values()) == [["1:midfielder_v1"]]
    publish_release(tmp_path / "published", dataset)
    assert load_release(tmp_path / "published").index == dataset.index


# ---- Error paths ---- #


@pytest.mark.parametrize("change", ["name", "season", "metric_labels"])
async def test_fetch_tasks_changed_source_quarantines_until_new_review(tmp_path, change):
    catalog, registry, tasks, _, value = tasks_for(tmp_path)
    value[change] = {"name": "Wrong person", "season": "2025-26", "metric_labels": ["Wrong"] * 7}[
        change
    ]
    scraper = AsyncMock()
    scraper.get_json.return_value = value
    assert await fetch_tasks(tasks, tmp_path, scraper, now=NOW) == {"source_invalid": 1}
    assert await fetch_tasks(tasks, tmp_path, scraper, now=NOW) == {"quarantined": 1}
    assert compile_dataset(catalog, registry, tasks, tmp_path, now=NOW).store.snapshots == []
    assert scraper.get_json.await_count == 1


async def test_fetch_tasks_unapproved_import_rejects_without_network(tmp_path):
    _, _, tasks, imported, _ = tasks_for(tmp_path, "imported")
    with pytest.raises(ValueError, match="unapproved"):
        await fetch_tasks(
            tasks,
            tmp_path,
            AsyncMock(),
            imports=RadarStore(snapshots=[imported.model_copy(update={"player_id": "99"})]),
        )
    changed = imported.model_copy(update={"player": "Someone else"})
    assert await fetch_tasks(
        tasks, tmp_path, AsyncMock(), imports=RadarStore(snapshots=[changed])
    ) == {"source_invalid": 1}


def test_publisher_lock_other_process_owner_rejects(tmp_path):
    with publisher_lock(tmp_path), pytest.raises(ValueError, match="publisher"):
        with publisher_lock(tmp_path):
            pass


async def test_publish_release_disk_failure_preserves_previous_pointer(tmp_path, monkeypatch):
    import fantasy_api.radar.releases as releases

    catalog, registry, tasks, imported, _ = tasks_for(tmp_path, "imported")
    await fetch_tasks(
        tasks, tmp_path, AsyncMock(), imports=RadarStore(snapshots=[imported]), now=NOW
    )
    dataset = compile_dataset(catalog, registry, tasks, tmp_path, now=NOW)
    root = tmp_path / "published"
    first = publish_release(root, dataset)

    def fail(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(releases, "atomic_json", fail)
    with pytest.raises(OSError):
        publish_release(root, dataset)
    assert read_json(root / "current.json")["release_id"] == first
    assert load_release(root).report["ready"] == 1


async def test_load_release_corrupt_file_rejects_and_does_not_rollback_to_corruption(tmp_path):
    catalog, registry, tasks, imported, _ = tasks_for(tmp_path, "imported")
    await fetch_tasks(
        tasks, tmp_path, AsyncMock(), imports=RadarStore(snapshots=[imported]), now=NOW
    )
    root = tmp_path / "published"
    rid = publish_release(root, compile_dataset(catalog, registry, tasks, tmp_path, now=NOW))
    atomic_json(root / "releases" / rid / "coverage.json", [])
    with pytest.raises(ValueError, match="checksum"):
        load_release(root)
    with pytest.raises(ValueError):
        rollback_release(root, "../../escape")


def test_plan_tasks_unaudited_role_and_position_conflict_rejects(tmp_path):
    catalog, registry, audits, _, _ = inputs(tmp_path)
    with pytest.raises(ValueError, match="audit"):
        plan_tasks(catalog, registry, SupplyAudits(), tmp_path)
    catalog.players[0].position_id = 2
    with pytest.raises(ValueError, match="conflict"):
        plan_tasks(catalog, registry, audits, tmp_path)
    registry.records[0].roles[0].position_override_reason = "Reviewed midfielder role this season"
    assert len(plan_tasks(catalog, registry, audits, tmp_path)) == 1


# ---- Edge cases ---- #


def test_compile_dataset_no_observations_accounts_all_and_preserves_unknown_eligibility(tmp_path):
    catalog, registry, tasks, _, _ = tasks_for(tmp_path)
    dataset = compile_dataset(catalog, registry, tasks, tmp_path, now=NOW)
    assert dataset.report["eligible_unknown"] == 2
    assert dataset.report["complete_radar_pct"] == 0
    assert len(dataset.coverage) == 2
    assert dataset.index == {}


async def test_compile_dataset_incomplete_and_low_minutes_have_distinct_reasons(tmp_path):
    catalog, registry, tasks, imported, _ = tasks_for(tmp_path, "imported")
    imported.percentiles["duel_win_pct"] = None
    await fetch_tasks(
        tasks, tmp_path, AsyncMock(), imports=RadarStore(snapshots=[imported]), now=NOW
    )
    assert (
        compile_dataset(catalog, registry, tasks, tmp_path, now=NOW).coverage[0].data_status
        == "incomplete_metrics"
    )


def test_compile_dataset_matched_without_role_reports_review_pending(tmp_path):
    catalog, registry, _, _, _ = tasks_for(tmp_path)
    registry.records[0].roles = []
    result = compile_dataset(catalog, registry, [], tmp_path, now=NOW)
    assert result.coverage[0].reason_code == "role_unresolved"


async def test_main_pipeline_offline_import_validates_publishes_reports_and_rolls_back(
    tmp_path, capsys
):
    from fantasy_api.cli.radar_sync import main

    catalog, registry, audits, imported, _ = inputs(tmp_path, "imported")
    atomic_json(tmp_path / "catalog.json", catalog.model_dump(mode="json"))
    atomic_json(tmp_path / "registry.json", registry.model_dump(mode="json"))
    atomic_json(tmp_path / "audits.json", audits.model_dump(mode="json"))
    atomic_json(tmp_path / "imports.json", RadarStore(snapshots=[imported]).model_dump(mode="json"))
    flags = [
        "--work-dir",
        str(tmp_path),
        "--registry",
        str(tmp_path / "registry.json"),
        "--audits",
        str(tmp_path / "audits.json"),
        "--captures",
        str(tmp_path),
    ]
    assert main(["plan", *flags]) == 0
    # main owns its async loop; use a thread when invoked from an async test.
    import asyncio

    assert (
        await asyncio.to_thread(
            main, ["fetch", *flags, "--imports", str(tmp_path / "imports.json")]
        )
        == 0
    )
    assert main(["validate", *flags]) == 0
    root = tmp_path / "published"
    assert (
        main(["publish", "--root", str(root), "--validated", str(tmp_path / "validated.json")]) == 0
    )
    rid = read_json(root / "current.json")["release_id"]
    assert main(["report", "--root", str(root)]) == 0
    assert main(["rollback", "--root", str(root), "--release-id", rid]) == 0
    assert main(["validate", *flags, "--stale-days", "30", "--maximum-days", "8"]) == 1
    assert "ready" in capsys.readouterr().out


def test_publish_release_file_size_limit_preserves_pointer(tmp_path, monkeypatch):
    import fantasy_api.radar.files as files

    catalog, registry, tasks, _, _ = tasks_for(tmp_path)
    dataset = compile_dataset(catalog, registry, tasks, tmp_path, now=NOW)
    root = tmp_path / "published"
    first = publish_release(root, dataset)
    monkeypatch.setattr(files, "MAX_BYTES", 10)
    with pytest.raises(ValueError, match="byte limit"):
        publish_release(root, dataset)
    assert read_json(root / "current.json")["release_id"] == first


async def test_fetch_tasks_missing_import_does_not_guess_absence(tmp_path):
    catalog, registry, tasks, _, _ = tasks_for(tmp_path, "imported")
    assert await fetch_tasks(tasks, tmp_path, AsyncMock(), now=NOW) == {"missing_import": 1}
    assert (
        compile_dataset(catalog, registry, tasks, tmp_path, now=NOW).coverage[0].reason_code
        == "not_published"
    )


async def test_compile_dataset_future_capture_rejects(tmp_path):
    catalog, registry, tasks, imported, _ = tasks_for(tmp_path, "imported")
    imported = imported.model_copy(update={"fetched_at": NOW + timedelta(days=1)})
    await fetch_tasks(
        tasks, tmp_path, AsyncMock(), imports=RadarStore(snapshots=[imported]), now=NOW
    )
    with pytest.raises(ValueError, match="future"):
        compile_dataset(catalog, registry, tasks, tmp_path, now=NOW)
