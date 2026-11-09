# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.services.clubs import ClubsService, _season_counts
from test_club_dossier import AUTH, Pages, Repo, _client, _fantasy

_FIXTURE = Path(__file__).parent / "fixtures" / "scraping" / "futbolfantasy_raphinha.json"
_PLAYER_PATH = "/internal/players/futbolfantasy"


def _document(season: dict[str, object]) -> dict[str, object]:
    document = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    document["seasonStats"] = season
    return document


OUTFIELD = {
    "view": "totals",
    "matchesCounted": 7,
    "participation": {"matchesPlayed": 7, "minutes": 550},
    "attack": {
        "goals": 4,
        "assists": 1,
        "successfulDribbles": 9,
        "shotsOnTarget": {"numerator": 3, "denominator": 7},
    },
    "discipline": {"yellowCards": 2, "redCards": 0},
    "defense": {"ballSteals": 11, "possessionsLost": 40, "penaltiesCommitted": 1},
    "goalkeeper": None,
}
KEEPER = {
    "view": "totals",
    "matchesCounted": 7,
    "participation": {"matchesPlayed": 7, "minutes": 630},
    "attack": None,
    "discipline": {"yellowCards": 1, "redCards": None},
    "defense": None,
    "goalkeeper": {"saves": 21, "penaltiesSaved": 0},
}


def _scraping(seen: list[httpx.Request]):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        assert request.headers.get("X-Service-Token") == "scraping-token"
        assert "Bearer" not in request.headers.get("Authorization", "")
        name = request.url.params.get("player_name")
        if request.url.path != _PLAYER_PATH:
            return httpx.Response(404, json={"error": "missing"})
        if name == "Ana":
            return httpx.Response(200, json=_document(OUTFIELD))
        if name == "Bea":
            return httpx.Response(200, json=_document(KEEPER))
        return httpx.Response(404, json={"error": "stats_source_not_found"})

    return handler


# ---- Happy path ---- #


def test_get_roster_stats_reads_season_totals_per_player_and_sums_published_counts() -> None:
    seen: list[httpx.Request] = []
    client = _client(scraping=httpx.MockTransport(_scraping(seen)))

    response = client.get("/clubs/20/roster-stats", headers=AUTH)

    assert response.status_code == 200
    body = response.json()
    players = {row["playerId"]: row for row in body["players"]}
    assert players["1"]["stats"] == {
        "minutes": 550,
        "goals": 4,
        "assists": 1,
        "dribbles": 9,
        "penaltiesCommitted": 1,
        "penaltiesSaved": None,
        "shots": 7,
        "recoveries": 11,
        "saves": None,
        "ballsLost": 40,
        "yellowCards": 2,
        "redCards": 0,
    }
    assert players["3"]["stats"]["saves"] == 21
    assert players["3"]["stats"]["redCards"] is None
    assert body["totals"]["minutes"] == 1180
    assert body["totals"]["saves"] == 21
    assert body["totals"]["goals"] == 4
    assert body["scope"] == "laliga"
    assert all(request.url.path == _PLAYER_PATH for request in seen)
    assert "Bearer valid-app-jwt" not in response.text


# ---- Error paths ---- #


def test_get_roster_stats_unreadable_profile_stays_null_not_zero() -> None:
    client = _client(scraping=httpx.MockTransport(_scraping([])))

    body = client.get("/clubs/20/roster-stats", headers=AUTH).json()

    zeta = next(row for row in body["players"] if row["playerId"] == "2")
    assert zeta["available"] is False
    assert all(value is None for value in zeta["stats"].values())
    assert body["coverage"] == {"requested": 3, "read": 2, "unavailable": 1}


def test_get_roster_stats_every_profile_failing_still_returns_200() -> None:
    client = _client(
        scraping=httpx.MockTransport(lambda request: httpx.Response(503, json={"error": "down"}))
    )

    response = client.get("/clubs/20/roster-stats", headers=AUTH)

    assert response.status_code == 200
    assert response.json()["coverage"]["read"] == 0
    assert all(value is None for value in response.json()["totals"].values())
    assert "down" not in response.text


def test_get_roster_stats_missing_jwt_returns_401() -> None:
    assert _client().get("/clubs/20/roster-stats").status_code == 401


def test_get_roster_stats_unknown_club_returns_404() -> None:
    assert _client().get("/clubs/999/roster-stats", headers=AUTH).status_code == 404


def test_get_roster_stats_catalog_failure_is_sanitized() -> None:
    def fantasy(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/players"):
            return httpx.Response(500, text="secret upstream body")
        return _fantasy(request)

    client = _client(
        fantasy=httpx.MockTransport(fantasy), scraping=httpx.MockTransport(_scraping([]))
    )

    response = client.get("/clubs/20/roster-stats", headers=AUTH)

    assert response.status_code >= 500
    assert "secret upstream body" not in response.text


@pytest.mark.asyncio
async def test_get_roster_stats_without_scraping_is_unavailable() -> None:
    service = ClubsService(Repo(), Pages())  # type: ignore[arg-type]

    with pytest.raises(UpstreamError) as raised:
        await service.get_roster_stats(9)

    assert raised.value.status_code == 503


# ---- Edge cases ---- #


def test_season_counts_missing_groups_and_bools_are_null() -> None:
    counts = _season_counts({"attack": {"goals": True, "shotsOnTarget": {"numerator": 2}}})

    assert counts["goals"] is None
    assert counts["shots"] is None
    assert _season_counts(None)["minutes"] is None


def test_season_counts_zero_is_a_published_value() -> None:
    assert _season_counts({"participation": {"minutes": 0}})["minutes"] == 0
