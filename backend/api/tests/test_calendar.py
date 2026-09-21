# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_api.api.deps import set_container
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.main import create_app
from fantasy_api.repositories.calendar import CalendarRepository
from fastapi.testclient import TestClient
from jwt_mint import mint_internal_jwt
from test_container import (
    TEST_FANTASY_ORIGIN as FANTASY_ORIGIN,
    TEST_LALIGA_BEARER as LALIGA_BEARER,
    build_test_container,
)

CURRENT_WEEK = {
    "isLive": False,
    "nextWeek": 9,
    "previousWeek": 7,
    "weekNumber": 8,
    "openingWeekDate": "2026-10-09T21:00:00+02:00",
    "closingWeekDate": "2026-10-13T03:00:00+02:00",
}

FIXTURE = {
    "id": "71",
    "matchDate": "2026-10-11T16:15:00+02:00",
    "date": "2026-10-11T16:15:00+02:00",
    "time": "2026-10-11T16:15:00+02:00",
    "localId": 16,
    "visitorId": 26,
    "matchState": 1,
    "localScore": None,
    "visitorScore": None,
    "featured": False,
}

MATCH_STATS = [
    {
        "id": 24,
        "date": "2026-08-28T17:00:00.000Z",
        "local": {
            "id": 49,
            "badgeColor": "https://example.test/badge.png",
            "mainName": "Home",
            "players": [
                {
                    "id": 1219,
                    "images": {"transparent": {"256x256": "https://example.test/p.png"}},
                    "name": "Player One",
                    "nickname": "One",
                    "positionId": 1,
                    "teamId": 49,
                    "weekPoints": 5,
                }
            ],
        },
        "visitor": {
            "id": 7,
            "badgeColor": "https://example.test/badge2.png",
            "mainName": "Away",
            "players": [],
        },
        "matchState": 7,
        "localScore": 3,
        "visitorScore": 2,
    }
]


@pytest.fixture
def rsa_pems() -> tuple[str, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = (
        key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return private_pem, public_pem


def _auth_must_not_run(_request: httpx.Request) -> httpx.Response:
    raise AssertionError("auth credentials client must not be called for calendar")


def make_client(
    public_pem: str,
    fantasy_handler: Callable[[httpx.Request], httpx.Response],
) -> TestClient:
    container = build_test_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
        auth_handler=httpx.MockTransport(_auth_must_not_run),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    return TestClient(app)


def _assert_public_fantasy_headers(request: httpx.Request) -> None:
    assert request.headers.get("Authorization") is None
    assert request.headers["Accept"] == "application/json"
    assert request.headers["x-lang"] == "es"


# ---- Happy path ---- #


def test_get_current_week_proxies_upstream_json(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        _assert_public_fantasy_headers(request)
        assert request.url.path == "/api/v1/competition/1/week/current"
        return httpx.Response(200, json=CURRENT_WEEK)

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/current",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json()["weekNumber"] == 8
    assert LALIGA_BEARER not in response.text


def test_get_fixtures_proxies_week_number_query(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        _assert_public_fantasy_headers(request)
        assert request.url.path == "/api/v1/competition/1/calendar"
        assert request.url.params.get("weekNumber") == "3"
        return httpx.Response(200, json=[FIXTURE])

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/weeks/3",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == "71"
    assert "localScore" not in body[0]


def test_get_week_stats_proxies_stats_path(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        _assert_public_fantasy_headers(request)
        assert request.url.path == "/stats/v1/competition/1/stats/week/3"
        return httpx.Response(200, json=MATCH_STATS)

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/weeks/3/stats",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body[0]["local"]["players"][0]["weekPoints"] == 5


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_public_json_omits_authorization() -> None:
    seen: dict[str, str | None] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers.get("Authorization")
        seen["x-lang"] = request.headers.get("x-lang")
        return httpx.Response(200, json={"ok": True})

    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(handler),
    )
    try:
        data = await client.get_public_json(
            "/api/v1/competition/1/calendar",
            params={"weekNumber": 2},
        )
    finally:
        await client.aclose()

    assert data == {"ok": True}
    assert seen["authorization"] is None
    assert seen["x-lang"] == "es"


@pytest.mark.asyncio
async def test_calendar_repository_get_fixtures_builds_path_and_params() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["weekNumber"] = request.url.params.get("weekNumber", "")
        return httpx.Response(200, json=[])

    laliga_client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(handler),
    )
    repo = CalendarRepository(laliga_client, competition_id=1)
    try:
        await repo.get_fixtures(5)
    finally:
        await laliga_client.aclose()

    assert seen["path"] == "/api/v1/competition/1/calendar"
    assert seen["weekNumber"] == "5"


# ---- Error paths ---- #


def test_get_current_week_missing_jwt_returns_401(rsa_pems: tuple[str, str]) -> None:
    _, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("fantasy must not be called without JWT")

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get("/calendar/current")

    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


def test_get_current_week_invalid_jwt_returns_401(rsa_pems: tuple[str, str]) -> None:
    _, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("fantasy must not be called with invalid JWT")

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/current",
            headers={"Authorization": "Bearer not-a-jwt"},
        )

    assert response.status_code == 401


def test_get_fixtures_fantasy_error_maps_upstream_error(
    rsa_pems: tuple[str, str],
) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "upstream secret"})

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/weeks/3",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 503
    assert response.json()["error"] == "fantasy_error"
    assert "upstream secret" not in response.text


def test_get_week_stats_non_json_200_returns_502(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not-json")

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/weeks/3/stats",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


def test_get_current_week_unexpected_shape_returns_502(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=["not", "an", "object"])

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/current",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


def test_get_week_stats_nested_validation_error_returns_502(
    rsa_pems: tuple[str, str],
) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    bad_stats = [
        {
            "id": 24,
            "local": {
                "id": 49,
                "players": "not-a-list",
            },
        }
    ]

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=bad_stats)

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/weeks/3/stats",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


def test_get_fixtures_unexpected_shape_returns_502(rsa_pems: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[1, 2, 3])

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/weeks/3",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


# ---- Edge cases ---- #


def test_get_fixtures_week_zero_returns_422_without_fantasy_call(
    rsa_pems: tuple[str, str],
) -> None:
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("fantasy must not be called for week=0")

    with make_client(public_pem, fantasy_handler) as client:
        response = client.get(
            "/calendar/weeks/0",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 422
