"""Malformed provider data must fail before statistics domain normalization."""

# ---- Mocks, fixtures & helpers ---- #

import pytest
from fantasy_api.api.payload import as_model_list
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.schemas.stats_provider import MarketHistoryPoint, TeamsMasterRow

# ---- Happy path ---- #


def test_market_history_numeric_string_normalizes_whole_euros() -> None:
    points = as_model_list([{"date": "2026-01-01", "marketValue": "42"}], MarketHistoryPoint)
    assert points[0].market_value == 42


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "row",
    [
        {"date": "invalid", "marketValue": 1},
        {"date": 1234, "marketValue": 1},
        {"date": "1234", "marketValue": 1},
        {"date": True, "marketValue": 1},
        {"date": "2026-01-01", "marketValue": True},
        {"date": "2026-01-01", "marketValue": 1.5},
        {"date": "2026-01-01", "marketValue": -1},
    ],
)
def test_market_history_invalid_sample_raises_upstream_error(row: dict) -> None:
    with pytest.raises(UpstreamError):
        as_model_list([row], MarketHistoryPoint)


@pytest.mark.parametrize(
    "row", [{"id": "broken", "name": "Club"}, {"id": 1, "name": {}}, {"name": "Club"}]
)
def test_teams_master_invalid_club_raises_upstream_error(row: dict) -> None:
    with pytest.raises(UpstreamError):
        as_model_list([row], TeamsMasterRow)
