"""Current LaLiga membership and 300-minute cutoff are enforced before publication."""

# ---- Mocks, fixtures & helpers ---- #

from unittest.mock import AsyncMock

import pytest
from fantasy_api.radar.eligibility import RadarEligibility, filter_publication
from fantasy_api.radar.releases import PublishedDataset, load_release, publish_release
from fantasy_api.services.radar_sync import compile_dataset, fetch_tasks
from test_radar_sync import tasks_for


def policy(**changes):
    """Build an explicit synthetic selection rule, not a percentile population."""
    return RadarEligibility.model_validate(
        dict(
            season="2026-27",
            competition="Test League",
            minimum_minutes=300,
            clubs={"4": ["Club"]},
            active_player_ids=["1", "2"],
        )
        | changes
    )


async def dataset(tmp_path, minutes):
    """Compile a genuinely validated checkpoint before applying selection."""
    from fantasy_api.radar.files import content_id

    catalog, registry, tasks, _, value = tasks_for(tmp_path)
    for p in catalog.players:
        p.team_id = "4"
    catalog.snapshot_id = content_id([p.model_dump() for p in catalog.players])
    value["minutes"] = minutes
    scraper = AsyncMock()
    scraper.get_json.return_value = value
    await fetch_tasks(tasks, tmp_path, scraper)
    return compile_dataset(catalog, registry, tasks, tmp_path)


# ---- Happy path ---- #


@pytest.mark.parametrize("minutes,ready", [(299, False), (300, True), (301, True)])
async def test_filter_publication_minimum_inclusive_preserves_real_values(tmp_path, minutes, ready):
    original = await dataset(tmp_path, minutes)
    selected = filter_publication(original, policy())
    assert bool(selected.store.snapshots) is ready
    assert selected.coverage[0].reason_code == ("ready" if ready else "insufficient_minutes")
    assert selected.coverage[1].reason_code == "identity_pending"
    assert len(original.store.snapshots) == 1
    publish_release(tmp_path / "published", selected)
    assert load_release(tmp_path / "published").report["ready"] == int(ready)


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "changes",
    [{"competition": "La Liga"}, {"clubs": {"4": ["Other club"]}}, {"active_player_ids": ["2"]}],
)
async def test_filter_publication_wrong_membership_or_league_never_serves_snapshot(
    tmp_path, changes
):
    selected = filter_publication(await dataset(tmp_path, 600), policy(**changes))
    assert selected.store.snapshots == []
    assert selected.coverage[0].reason_code == "out_of_scope"


async def test_filter_publication_wrong_season_rejects_without_relabelling(tmp_path):
    with pytest.raises(ValueError, match="season"):
        filter_publication(await dataset(tmp_path, 600), policy(season="2025-26"))


async def test_published_dataset_changed_policy_rejects_hash_mismatch(tmp_path):
    value = filter_publication(await dataset(tmp_path, 600), policy()).model_dump(mode="json")
    value["provenance"]["eligibility"]["minimum_minutes"] = 301
    with pytest.raises(ValueError, match="provenance"):
        PublishedDataset.model_validate(value)


# ---- Edge cases ---- #


async def test_filter_publication_higher_cutoff_rejects_old_snapshot_even_if_hash_retained(
    tmp_path,
):
    value = filter_publication(await dataset(tmp_path, 300), policy()).model_dump(mode="json")
    value["provenance"]["eligibility"]["minimum_minutes"] = 301
    with pytest.raises(ValueError, match="eligibility"):
        PublishedDataset.model_validate(value)


async def test_filter_publication_legacy_release_requires_revalidation(tmp_path):
    original = await dataset(tmp_path, 600)
    legacy = PublishedDataset.model_validate(
        original.model_dump(mode="json") | {"provenance": None}
    )
    with pytest.raises(ValueError, match="revalidate"):
        filter_publication(legacy, policy())


async def test_published_dataset_eligibility_requires_versioned_provenance(tmp_path):
    value = filter_publication(await dataset(tmp_path, 600), policy()).model_dump(mode="json")
    value["provenance"]["format"] = "radar-provenance-v1"
    with pytest.raises(ValueError, match="version"):
        PublishedDataset.model_validate(value)


def test_policy_roster_order_is_canonical_for_semantic_hashes():
    assert policy(active_player_ids=["2", "1"]).model_dump() == policy().model_dump()
