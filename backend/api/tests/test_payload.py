"""Tests for Fantasy JSON payload normalizers."""

from __future__ import annotations

import pytest
from fantasy_api.schemas.payload import as_market_snapshot, as_player_team_offers


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


# ---- Happy path ---- #


def test_as_player_team_offers_empty_array_returns_empty_offers() -> None:
    assert as_player_team_offers([]) == {"offers": []}


def test_as_player_team_offers_bare_array_wraps_offers() -> None:
    offers = [{"id": "o-1", "money": 2_000_000, "status": "pending", "isFromMarket": True}]
    assert as_player_team_offers(offers) == {"offers": offers}


def test_as_player_team_offers_legacy_object_preserves_envelope() -> None:
    payload = {"offers": [{"id": "o-1"}], "bids": []}
    assert as_player_team_offers(payload) == payload


# ---- Error paths ---- #


@pytest.mark.parametrize("payload", [None, "unexpected", 42, [None], [42], [[]], [{}]])
def test_as_player_team_offers_unexpected_shape_raises_value_error(payload: object) -> None:
    with pytest.raises(ValueError):
        as_player_team_offers(payload)
