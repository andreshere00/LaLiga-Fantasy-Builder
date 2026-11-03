"""Inventory correctness, change detection and safe offline operations."""

# ---- Mocks, fixtures & helpers ---- #

import json

import pytest
from fantasy_api.cli.radar_sync import main
from fantasy_api.radar.catalog import build_inventory, inventory_report
from fantasy_api.radar.files import atomic_json, read_json


def row(player_id=1, position=3, **extra):
    """Synthetic public master catalog entry."""
    return {"id": player_id, "nickname": "Player", "positionId": position, **extra}


# ---- Happy path ---- #


def test_build_inventory_unknown_positions_and_coaches_accounts_all():
    catalog = build_inventory([row(), row(2, 5), row(3, None)], "2026-27")
    assert [p.player_id for p in catalog.players] == ["1", "3"]
    assert catalog.excluded_coaches == ["2"]
    assert inventory_report(catalog)["position_review"] == 1


def test_build_inventory_transfer_and_departure_preserves_history():
    original = build_inventory([row(), row(2)], "2026-27")
    updated = build_inventory(
        [row(nickname="New name", teamId=8), row(3)],
        "2026-27",
        original,
        allow_large_removal=True,
    )
    assert updated.changed == ["1"]
    assert updated.added == ["3"]
    assert updated.removed == ["2"]
    assert updated.archived[0].player_id == "2"
    returned = build_inventory([row(), row(2), row(3)], "2026-27", updated)
    assert returned.archived == []


def test_main_offline_inventory_writes_all_footballers_without_login(tmp_path, capsys):
    source = tmp_path / "input.json"
    source.write_text(json.dumps([row(), row(2)]))
    args = [
        "inventory",
        "--catalog",
        str(source),
        "--work-dir",
        str(tmp_path / "job"),
        "--season",
        "2026-27",
    ]
    assert main(args) == 0
    assert len(read_json(tmp_path / "job/coverage.json")["players"]) == 2
    old = (tmp_path / "job/catalog.json").read_bytes()
    source.write_text("{}")
    assert main(args) == 1
    assert (tmp_path / "job/catalog.json").read_bytes() == old
    assert "failed" in capsys.readouterr().err


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "payload",
    [
        [],
        {},
        [row(), row()],
        [row(True)],
        [row("abc")],
        [row(playerTeamId=3)],
        [row(nickname=None)],
    ],
)
def test_build_inventory_invalid_catalog_rejects(payload):
    with pytest.raises(ValueError):
        build_inventory(payload, "2026-27")


def test_build_inventory_large_drop_rejects_partial_response():
    previous = build_inventory([row(i) for i in range(20)], "2026-27")
    with pytest.raises(ValueError, match="ten percent"):
        build_inventory([row()], "2026-27", previous)
    with pytest.raises(ValueError, match="minimum"):
        build_inventory([row()], "2026-27", minimum_count=10)


def test_atomic_json_invalid_content_preserves_existing(tmp_path):
    path = tmp_path / "data.json"
    atomic_json(path, {"good": True})
    with pytest.raises(ValueError):
        atomic_json(path, {"value": float("nan")})
    assert read_json(path) == {"good": True}
    with pytest.raises(ValueError):
        read_json(path, limit=1)


# ---- Edge cases ---- #


def test_build_inventory_same_catalog_keeps_semantic_id():
    first = build_inventory([row()], "2026-27")
    second = build_inventory([row()], "2026-27", first)
    assert first.snapshot_id == second.snapshot_id
    assert second.added == second.changed == second.removed == []
