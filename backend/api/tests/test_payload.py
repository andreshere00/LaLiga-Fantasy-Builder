"""Tests for Fantasy JSON payload normalizers."""

from __future__ import annotations

import pytest
from fantasy_api.schemas.payload import as_market_snapshot


def test_as_market_snapshot_null_returns_empty_lists() -> None:
    assert as_market_snapshot(None) == {"marketPlayers": [], "userBids": []}


def test_as_market_snapshot_list_wraps_market_players() -> None:
    listing = [{"id": "m1", "playerMaster": {"id": "7"}}]
    assert as_market_snapshot(listing) == {"marketPlayers": listing}


def test_as_market_snapshot_list_rejects_non_objects() -> None:
    with pytest.raises(ValueError, match="expected objects"):
        as_market_snapshot(["not-a-dict"])


def test_as_market_snapshot_unwraps_nested_market_object() -> None:
    nested = {"marketPlayers": [{"id": "m1"}], "userBids": []}
    assert as_market_snapshot({"market": nested}) == nested


def test_as_market_snapshot_passes_through_snapshot_object() -> None:
    snapshot = {"marketPlayers": [{"id": "m1"}], "userBids": []}
    assert as_market_snapshot(snapshot) == snapshot
