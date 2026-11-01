"""Reviewed identities are explicit; homonyms and transfers never auto-match."""

# ---- Mocks, fixtures & helpers ---- #

import json

import pytest
from fantasy_api.cli.radar_sync import main
from fantasy_api.radar.catalog import build_inventory
from fantasy_api.radar.registry import IdentityDecision, IdentityRegistry, propose_identities


def decision(**changes):
    """Synthetic approved profile with evidence; no real identities."""
    data = dict(
        player_id="1",
        season="2026-27",
        version=1,
        status="matched",
        source_key="Test_Midfielder_stats",
        expected_name="Test Player",
        evidence=["https://datamb.football/Test_Midfielder_stats/"],
        reviewed_at="2026-11-01T10:00:00Z",
        reviewer="Operator",
        valid_from="2026-07-01",
    )
    return IdentityDecision.model_validate(data | changes)


# ---- Happy path ---- #


def test_propose_identities_homonyms_stay_pending_and_do_not_invent_urls():
    catalog = build_inventory(
        [
            {"id": 1, "nickname": "Same", "positionId": 3},
            {"id": 2, "nickname": "Same", "positionId": 3},
        ],
        "2026-27",
    )
    rows = propose_identities(
        catalog,
        {
            "players": [
                {"id": "1", "full_name": "Known name", "name_sources": ["https://example.com/one"]}
            ]
        },
    )
    assert len(rows) == 2
    assert all(r["status"] == "pending_review" and r["source_key"] is None for r in rows)
    assert rows[0]["names"] == ["Same", "Known name"]
    assert rows[1]["names"] == ["Same"]


def test_registry_superseded_reference_retains_history_and_latest_pending_blocks_use():
    first = decision()
    second = decision(version=2, status="ambiguous", source_key=None)
    registry = IdentityRegistry(records=[second, first])
    assert registry.current()[("1", "2026-27")].status == "ambiguous"
    assert len(registry.records) == 2


def test_main_registry_and_candidates_validates_offline(tmp_path, capsys):
    path = tmp_path / "registry.json"
    path.write_text(IdentityRegistry(records=[decision()]).model_dump_json())
    assert main(["registry", "--registry", str(path)]) == 0
    (tmp_path / "catalog.json").write_text(
        build_inventory(
            [{"id": 1, "nickname": "Player", "positionId": 3}], "2026-27"
        ).model_dump_json()
    )
    aliases = tmp_path / "aliases.json"
    aliases.write_text(json.dumps({"players": []}))
    assert main(["candidates", "--work-dir", str(tmp_path), "--aliases", str(aliases)]) == 0
    assert json.loads((tmp_path / "identity-review.json").read_text())[0]["source_key"] is None


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "changes",
    [
        {"evidence": []},
        {"reviewed_at": None},
        {"reviewer": None},
        {"expected_name": None},
        {"source_key": "../injected"},
        {"evidence": ["file:///tmp/test"]},
        {"evidence": ["https://example.com/not-observed"]},
        {"valid_until": "2026-06-01"},
    ],
)
def test_decision_unreviewed_or_invalid_reference_rejects(changes):
    with pytest.raises(ValueError):
        decision(**changes)


def test_registry_duplicate_version_or_source_for_different_ids_rejects():
    with pytest.raises(ValueError, match="version"):
        IdentityRegistry(records=[decision(), decision()])
    with pytest.raises(ValueError, match="multiple"):
        IdentityRegistry(records=[decision(), decision(player_id="2")])


@pytest.mark.parametrize(
    "aliases",
    [{}, {"players": [None]}, {"players": [{"id": "x"}]}, {"players": [{"id": 1}, {"id": 1}]}],
)
def test_propose_identities_invalid_alias_inventory_rejects(aliases):
    catalog = build_inventory([{"id": 1, "nickname": "Name"}], "2026-27")
    with pytest.raises(ValueError):
        propose_identities(catalog, aliases)


# ---- Edge cases ---- #


def test_registry_separate_seasons_keep_independent_identity():
    registry = IdentityRegistry(records=[decision(), decision(season="2025-26")])
    assert len(registry.current()) == 2
