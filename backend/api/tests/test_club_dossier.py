# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
from fantasy_api.api.deps import build_container
from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import Settings
from fantasy_api.domain.club_pages import FutbolFantasyClubPage, load_futbolfantasy_club_pages
from fantasy_api.domain.errors import NeedsReauthError, UnauthorizedError
from fantasy_api.main import create_app
from fantasy_api.schemas.clubs import ClubMatch, ScrapedClubPage
from fantasy_api.schemas.fixture_standings import SeasonFixture
from fantasy_api.schemas.players import CatalogPlayer
from fantasy_api.services.clubs import (
    ClubsService,
    _next_match,
    _performance,
    _prediction,
    _roster,
)
from fastapi.testclient import TestClient
from pydantic import SecretStr
from test_container import TEST_FANTASY_ORIGIN, TEST_SERVICE_TOKEN
from test_container import test_settings as container_settings

AUTH = {"Authorization": "Bearer valid-app-jwt"}
NOW = datetime(2026, 11, 7, 12, tzinfo=UTC)


class Validator:
    """Accept one test JWT."""

    def validate(self, token: str) -> dict[str, str]:
        if token == "reauth":
            raise NeedsReauthError("needs_reauth")
        if token != "valid-app-jwt":
            raise UnauthorizedError("invalid app JWT")
        return {"sub": "app-user"}


class Pages:
    """Slug directory with one current club and no FutbolFantasy page."""

    def __init__(self) -> None:
        self.clubs = (FutbolFantasyClubPage(team_id=9, name="Getafe CF", slug="getafe"),)

    def slug_for(self, team_id: int) -> str | None:
        return None if team_id == 9 else "unused"


class Repo:
    """In-memory dossier reads."""

    def __init__(self) -> None:
        self.called = False

    async def clubs(self) -> list[object]:
        from fantasy_api.schemas.stats_provider import TeamsMasterRow

        return [TeamsMasterRow.model_validate({"id": 9, "name": "Getafe CF", "shortName": "GET"})]

    async def fixtures(self) -> list[object]:
        return []

    async def catalog(self) -> list[object]:
        return []

    async def club_page(self, slug: str) -> object:
        self.called = True
        raise AssertionError(slug)

    async def club_news(self, slug: str) -> object:
        self.called = True
        raise AssertionError(slug)


def _masters() -> list[dict[str, object]]:
    return [
        {
            "id": club.team_id,
            "name": club.name,
            "shortName": club.slug[:3].upper(),
            "badgeColor": f"https://badges.test/{club.slug}.png",
        }
        for club in load_futbolfantasy_club_pages().clubs
    ]


def _players() -> list[dict[str, object]]:
    return [
        {
            "id": 1,
            "nickname": "Ana",
            "positionId": 4,
            "teamId": 20,
            "points": 5,
            "lastStats": [{"weekNumber": 12, "stats": {"mins_played": [90, 1], "goals": [1, 1]}}],
        },
        {"id": 2, "nickname": "Zeta", "positionId": 3, "teamId": 20, "points": 5},
        {"id": 3, "nickname": "Bea", "positionId": 2, "teamId": 20, "points": 4},
        {"id": 4, "nickname": "Coach", "positionId": 5, "teamId": 20, "points": 99},
        {"id": 5, "nickname": "Other", "positionId": 4, "teamId": 9, "points": 20},
    ]


def _fixture(
    match_id: str,
    local: int,
    visitor: int,
    state: int,
    home: int | None,
    away: int | None,
    when: str,
) -> dict[str, object]:
    return {
        "id": match_id,
        "localId": local,
        "visitorId": visitor,
        "matchState": state,
        "matchDate": when,
        "localScore": home,
        "visitorScore": away,
    }


def _fantasy(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    week = request.url.params.get("weekNumber")
    if path == "/api/v3/teams-master":
        assert request.headers.get("authorization") is None
        return httpx.Response(200, json=_masters())
    if path.endswith("/players"):
        return httpx.Response(200, json=_players())
    if path.endswith("/calendar"):
        if week == "1":
            return httpx.Response(
                200,
                json=[
                    _fixture("101", 20, 9, 7, 2, 0, "2026-09-01T18:00:00Z"),
                    _fixture("102", 4, 20, 7, 1, 1, "2026-09-08T18:00:00Z"),
                ],
            )
        if week == "12":
            return httpx.Response(
                200,
                json=[_fixture("112", 20, 3, 1, None, None, "2026-11-08T18:00:00Z")],
            )
        return httpx.Response(200, json=[])
    return httpx.Response(404, json={"error": "missing"})


def _scraping(request: httpx.Request) -> httpx.Response:
    assert request.headers.get("X-Service-Token") == "scraping-token"
    assert "Bearer" not in request.headers.get("Authorization", "")
    if request.url.path == "/internal/clubs/villarreal/news":
        return httpx.Response(503, json={"error": "scraping_unavailable"})
    if request.url.path == "/internal/clubs/villarreal":
        return httpx.Response(
            200,
            json={
                "slug": "villarreal",
                "matchday": 12,
                "coach": {"name": "Íñigo Pérez", "matchday": 12, "seasonPredictabilityPercent": 79},
                "starters": [{"name": "Moleiro", "role": "starter", "probability": 80}],
                "alternatives": [{"name": "Diatta", "role": "alternative", "probability": 0}],
                "fixtures": [
                    {
                        "competition": "copa_del_rey",
                        "competitionLabel": "Copa del Rey",
                        "home": "Manacor",
                        "away": "Villarreal",
                        "regulation": {"home": 0, "away": 5},
                        "outcome": "win",
                        "url": "https://www.futbolfantasy.com/partidos/copa",
                        "scheduled": False,
                    }
                ],
                "injuries": [],
            },
        )
    return httpx.Response(404, json={"error": "missing"})


def _settings() -> Settings:
    base = container_settings()
    return base.model_copy(
        update={
            "scraping_base_url": "http://scraping.test",
            "scraping_service_token": SecretStr("scraping-token"),
        }
    )


def _client(
    fantasy: httpx.MockTransport | None = None,
    scraping: httpx.MockTransport | None = None,
    validator: Validator | None = None,
) -> TestClient:
    settings = _settings()
    container = build_container(
        settings,
        jwt_validator=validator or Validator(),
        credentials=AuthCredentialsClient(
            base_url=settings.auth_internal_base_url,
            service_token=TEST_SERVICE_TOKEN,
            transport=httpx.MockTransport(lambda request: httpx.Response(500)),
        ),
        laliga_client=LaligaFantasyClient(
            origin=TEST_FANTASY_ORIGIN,
            transport=fantasy or httpx.MockTransport(_fantasy),
        ),
        scraping_transport=scraping or httpx.MockTransport(_scraping),
    )
    container.clubs_service._now = lambda: NOW
    return TestClient(create_app(settings, container))


# ---- Happy path ---- #


def test_get_club_returns_roster_laliga_record_and_prediction() -> None:
    response = _client().get("/clubs/20", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["club"]["slug"] == "villarreal"
    assert body["club"]["badgeUrl"] == "https://badges.test/villarreal.png"
    assert [mvp["name"] for mvp in body["roster"]["mvps"]] == ["Ana", "Zeta", "Bea"]
    assert body["roster"]["totals"]["minutes"] == 90
    assert body["roster"]["totals"]["goals"] == 1
    assert body["roster"]["coverage"]["shortWindow"] is True
    assert "records" not in body["performance"]
    assert body["performance"]["nextMatchId"] == "112"
    assert body["prediction"]["coach"]["name"] == "Íñigo Pérez"
    assert body["prediction"]["alternatives"][0]["probability"] == 0
    assert any(item["segment"] == "news" for item in body["segmentErrors"])
    assert "laliga-secret" not in response.text
    assert "<html" not in response.text


def test_list_clubs_includes_verified_slug() -> None:
    response = _client().get("/clubs", headers=AUTH)
    assert response.status_code == 200
    slugs = {club["slug"] for club in response.json()["clubs"]}
    assert slugs == {club.slug for club in load_futbolfantasy_club_pages().clubs}


# ---- Error paths ---- #


def test_get_club_missing_jwt_returns_401() -> None:
    response = _client().get("/clubs/20")
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


def test_get_club_needs_reauth_returns_401() -> None:
    response = _client().get("/clubs/20", headers={"Authorization": "Bearer reauth"})
    assert response.status_code == 401
    assert response.json()["error"] == "needs_reauth"


def test_list_clubs_non_json_200_returns_502() -> None:
    def fantasy(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/teams-master":
            return httpx.Response(200, text="<html>no</html>")
        return httpx.Response(200, json=[])

    response = _client(fantasy=httpx.MockTransport(fantasy)).get("/clubs", headers=AUTH)
    assert response.status_code == 502
    assert "html" not in response.text


def test_list_clubs_malformed_json_returns_502() -> None:
    def fantasy(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/teams-master":
            return httpx.Response(200, content=b"{", headers={"content-type": "application/json"})
        return httpx.Response(200, json=[])

    response = _client(fantasy=httpx.MockTransport(fantasy)).get("/clubs", headers=AUTH)
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"
    assert response.json()["detail"] != "{"


def test_get_club_upstream_failure_is_sanitized() -> None:
    def fantasy(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/teams-master":
            return httpx.Response(503, json={"bearer": "secret-token", "detail": "boom"})
        return httpx.Response(200, json=[])

    response = _client(fantasy=httpx.MockTransport(fantasy)).get("/clubs/20", headers=AUTH)
    assert response.status_code == 503
    assert "secret-token" not in response.text


def test_get_club_unknown_id_returns_404() -> None:
    response = _client().get("/clubs/999", headers=AUTH)
    assert response.status_code == 404


# ---- Edge cases ---- #


@pytest.mark.asyncio
async def test_news_keeps_every_event_with_kind_target_and_report_link() -> None:
    from fantasy_api.schemas.clubs import ScrapedClubNews, ScrapedClubPage
    from fantasy_api.services.clubs import _injuries

    class NewsRepo(Repo):
        async def club_news(self, slug: str) -> ScrapedClubNews:
            return ScrapedClubNews.model_validate(
                {
                    "slug": slug,
                    "items": [
                        {
                            "title": f"Event {index}",
                            "url": "https://www.futbolfantasy.com/laliga/equipos/getafe",
                            "kind": "lineup",
                        }
                        for index in range(8)
                    ]
                    + [
                        {
                            "title": "Paredes pasa de duda a baja",
                            "url": "https://www.futbolfantasy.com/laliga/noticias/1-x",
                            "kind": "injury_update",
                            "target": "article",
                        }
                    ],
                }
            )

    service = ClubsService(NewsRepo(), Pages())  # type: ignore[arg-type]
    news, error = await service._news("getafe")
    assert error is None and news is not None
    assert len(news.items) == 9
    assert news.items[0].target == "club" and news.items[0].kind == "lineup"
    assert news.items[-1].target == "article" and news.items[-1].kind == "injury_update"
    page = ScrapedClubPage.model_validate(
        {"slug": "getafe", "injuries": [{"name": "A", "reportUrl": "https://x.test/r"}]}
    )
    assert _injuries(page).items[0].report_url == "https://x.test/r"


@pytest.mark.asyncio
async def test_get_dossier_without_slug_keeps_the_club_and_skips_scraping() -> None:
    service = ClubsService(Repo(), Pages())  # type: ignore[arg-type]
    dossier = await service.get_dossier(9)
    assert dossier.club.slug is None
    assert dossier.prediction is None
    assert {error.segment for error in dossier.segment_errors} == {"prediction", "injuries", "news"}
    assert {error.code for error in dossier.segment_errors} == {"club_page_unavailable"}


def test_roster_mvp_tie_break_uses_name_then_id() -> None:
    players = [CatalogPlayer.model_validate(row) for row in _players()]
    roster = _roster(20, players, finalized_count=2)
    assert [mvp.name for mvp in roster.mvps] == ["Ana", "Zeta", "Bea"]
    assert roster.coverage.short_window is True
    same = [
        CatalogPlayer.model_validate(
            {"id": player_id, "nickname": "Ana", "positionId": 4, "teamId": 20, "points": 5}
        )
        for player_id in (9, 2)
    ]
    assert [mvp.player_id for mvp in _roster(20, same, finalized_count=0).mvps] == ["2", "9"]


def test_performance_home_and_away_splits_ignore_unfinished_matches() -> None:
    fixtures = [
        SeasonFixture.model_validate(_fixture("101", 20, 9, 7, 2, 0, "2026-09-01T18:00:00Z")),
        SeasonFixture.model_validate(_fixture("102", 4, 20, 7, 1, 1, "2026-09-08T18:00:00Z")),
        SeasonFixture.model_validate(_fixture("112", 20, 3, 1, None, None, "2026-11-08T18:00:00Z")),
    ]
    scraped = ScrapedClubPage.model_validate(
        {
            "slug": "villarreal",
            "fixtures": [
                {
                    "competition": "copa_del_rey",
                    "home": "Manacor",
                    "away": "Villarreal",
                    "regulation": {"home": 0, "away": 5},
                    "final": {"home": 0, "away": 5},
                    "outcome": "win",
                    "scheduled": False,
                }
            ],
        }
    )
    performance = _performance(20, fixtures, scraped, {"villarreal"}, NOW)
    finished = [match for match in performance.matches if not match.scheduled]
    assert [(m.group, m.venue, m.outcome) for m in finished] == [
        ("laliga", "home", "win"),
        ("laliga", "away", "draw"),
        ("domestic", "away", "win"),
    ]
    assert performance.next_match_id == "112"


def test_other_matches_venue_uses_the_name_shared_by_every_fixture() -> None:
    scraped = ScrapedClubPage.model_validate(
        {
            "slug": "getafe",
            "fixtures": [
                {
                    "competition": "conference_league",
                    "home": "Getafe",
                    "away": "Brighton",
                    "regulation": {"home": 3, "away": 0},
                    "outcome": "win",
                },
                {
                    "competition": "conference_league",
                    "home": "Iberia 1999",
                    "away": "Getafe",
                    "regulation": {"home": 0, "away": 1},
                    "outcome": "win",
                },
                {"competition": "laliga", "home": "Sevilla", "away": "Getafe"},
            ],
        }
    )

    performance = _performance(9, [], scraped, {"getafe cf", "get"})

    assert [match.venue for match in performance.matches] == ["home", "away"]


def test_other_matches_venue_falls_back_to_labels_when_fixtures_are_ambiguous() -> None:
    scraped = ScrapedClubPage.model_validate(
        {
            "slug": "getafe",
            "fixtures": [
                {
                    "competition": "copa_del_rey",
                    "home": "Getafe CF",
                    "away": "Lebrijana",
                    "regulation": {"home": 2, "away": 0},
                    "outcome": "win",
                }
            ],
        }
    )

    performance = _performance(9, [], scraped, {"getafe cf"})

    assert performance.matches[0].venue == "home"


def test_performance_keeps_unrecognised_competitions_in_the_other_group() -> None:
    scraped = ScrapedClubPage.model_validate(
        {
            "slug": "getafe",
            "fixtures": [
                {
                    "competition": "other",
                    "home": "Getafe",
                    "away": "Atlético",
                    "regulation": {"home": 1, "away": 0},
                    "outcome": "win",
                },
                {"competition": "laliga", "home": "Getafe", "away": "Sevilla", "scheduled": True},
            ],
        }
    )

    performance = _performance(9, [], scraped, {"getafe cf"})

    assert [match.group for match in performance.matches] == ["friendly"]


def _scheduled(
    match_id: str,
    *,
    kickoff: datetime | None = None,
    text: str | None = None,
    group: str = "laliga",
) -> ClubMatch:
    return ClubMatch(
        match_id=match_id,
        competition=group,
        group=group,
        home="Getafe",
        away="Rival",
        kickoff=kickoff,
        kickoff_text=text,
        scheduled=True,
    )


def test_next_match_skips_a_past_fixture_still_marked_scheduled() -> None:
    # Arrange
    now = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)
    matches = [
        _scheduled("stale", kickoff=datetime(2026, 10, 25, 18, 30, tzinfo=UTC)),
        _scheduled("next", kickoff=datetime(2026, 11, 22, 21, 0, tzinfo=UTC)),
        _scheduled("later", kickoff=datetime(2026, 12, 6, 20, 0, tzinfo=UTC)),
    ]

    # Act / Assert
    assert _next_match(matches, now) == "next"


def test_next_match_compares_dated_laliga_and_printed_cup_kickoffs() -> None:
    # Arrange
    now = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)
    matches = [
        _scheduled("liga", kickoff=datetime(2026, 11, 22, 21, 0, tzinfo=UTC)),
        _scheduled("cup", text="Mié 11/11 \n21:00h", group="domestic"),
        _scheduled("euro", text="Jue 26/11 18:45h", group="european"),
    ]

    # Act / Assert
    assert _next_match(matches, now) == "cup"


def test_next_match_reads_a_printed_january_date_in_the_next_year() -> None:
    # Arrange
    now = datetime(2026, 12, 28, 12, 0, tzinfo=UTC)
    matches = [_scheduled("cup", text="Mié 06/01 21:00h", group="domestic")]

    # Act / Assert
    assert _next_match(matches, now) == "cup"


def test_next_match_ignores_matches_it_cannot_place_on_the_calendar() -> None:
    # Arrange
    now = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)
    matches = [
        _scheduled("undated"),
        _scheduled("garbled", text="por determinar", group="domestic"),
        _scheduled("impossible", text="Lun 31/02 21:00h", group="domestic"),
    ]

    # Act / Assert
    assert _next_match(matches, now) is None


def test_next_match_ignores_finished_matches() -> None:
    # Arrange
    now = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)
    played = _scheduled("played", kickoff=datetime(2026, 11, 20, 21, 0, tzinfo=UTC))
    played.scheduled = False

    # Act / Assert
    assert _next_match([played], now) is None


def test_prediction_ignores_fields_the_response_does_not_declare() -> None:
    # Arrange
    scraped = ScrapedClubPage.model_validate(
        {
            "slug": "villarreal",
            "coach": {"name": "Coach", "badge": "x"},
            "starters": [{"name": "Moleiro", "role": "starter", "injured": False}],
            "alternatives": [{"name": "Diatta", "role": "alternative", "slug": "diatta"}],
            "summary": {"averageProbability": 70, "extra": 1},
        }
    )

    # Act
    prediction = _prediction(scraped)

    # Assert
    assert prediction.starters[0].name == "Moleiro"
    assert prediction.alternatives[0].name == "Diatta"
    assert prediction.summary is not None and prediction.summary.average_probability == 70


def test_performance_gives_other_competitions_a_kickoff_from_the_printed_date() -> None:
    # Arrange
    scraped = ScrapedClubPage.model_validate(
        {
            "slug": "getafe",
            "fixtures": [
                {
                    "competition": "champions_league",
                    "home": "Getafe",
                    "away": "Brighton",
                    "kickoff": "Mié 11/11 21:00h",
                    "scheduled": True,
                },
                {"competition": "champions_league", "home": "Getafe", "away": "Ajax"},
            ],
        }
    )

    # Act
    performance = _performance(9, [], scraped, {"getafe"}, NOW)

    # Assert
    kickoffs = [match.kickoff for match in performance.matches]
    assert kickoffs[0] == datetime(2026, 11, 11, 20, 0, tzinfo=UTC)
    assert kickoffs[1] is None


async def test_catalog_repeated_reads_download_the_public_catalog_once() -> None:
    # Arrange
    from fantasy_api.repositories.clubs import ClubsRepository

    class Players:
        calls = 0

        async def list_players(self) -> list[dict[str, object]]:
            self.calls += 1
            return _players()

    repository = ClubsRepository(None, None, None, competition_id=1)  # type: ignore[arg-type]
    players = Players()
    repository._players = players  # type: ignore[assignment]

    # Act
    first = await repository.catalog()
    second = await repository.catalog()

    # Assert
    assert players.calls == 1
    assert first == second
