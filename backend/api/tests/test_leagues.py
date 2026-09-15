# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import time
from collections.abc import Callable

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fantasy_api.api.deps import AppContainer, set_container
from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import Settings
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.main import create_app
from fantasy_api.repositories.leagues import LeaguesRepository
from fantasy_api.schemas.leagues import summarize_leagues_payload
from fantasy_api.security.internal_jwt import StaticInternalJwtValidator
from fantasy_api.services.leagues import LeaguesService
from fastapi.testclient import TestClient

ISSUER = "https://auth.fantasy-builder.local"
AUDIENCE = "fantasy-api"
SERVICE_TOKEN = "api-service-token"
FANTASY_ORIGIN = "https://fantasy.test"
LALIGA_BEARER = "laliga-secret-token"


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


def mint_internal_jwt(
    private_pem: str,
    *,
    sub: str = "app-user-1",
    issuer: str = ISSUER,
    audience: str = AUDIENCE,
    ttl_seconds: int = 300,
) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": sub,
            "email": "u@example.com",
            "name": "User",
            "iss": issuer,
            "aud": audience,
            "iat": now,
            "exp": now + ttl_seconds,
        },
        private_pem,
        algorithm="RS256",
    )


def _auth_ok_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/internal/laliga/bearer"
    assert request.headers.get("X-Service-Token") == SERVICE_TOKEN
    assert request.headers.get("Authorization", "").startswith("Bearer ")
    return httpx.Response(
        200,
        json={
            "bearer_token": LALIGA_BEARER,
            "expires_at": int(time.time()) + 100,
            "token_type": "Bearer",
        },
    )


def _auth_needs_reauth_handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        401,
        json={"error": "needs_reauth", "detail": "pair again"},
    )


def build_leagues_container(
    public_pem: str,
    *,
    fantasy_handler: httpx.MockTransport | None = None,
    auth_handler: httpx.MockTransport | None = None,
) -> AppContainer:
    settings = Settings(
        auth_jwks_url="http://auth.test/jwks",
        internal_jwt_issuer=ISSUER,
        internal_jwt_audience=AUDIENCE,
        auth_internal_base_url="http://auth.test",
        internal_service_token=SERVICE_TOKEN,
        laliga_fantasy_origin=FANTASY_ORIGIN,
        laliga_competition_id=1,
        log_json=False,
    )
    credentials = AuthCredentialsClient(
        base_url=settings.auth_internal_base_url,
        service_token=SERVICE_TOKEN,
        transport=auth_handler or httpx.MockTransport(_auth_ok_handler),
    )
    laliga_client = LaligaFantasyClient(
        origin=settings.laliga_fantasy_origin,
        transport=fantasy_handler,
    )
    return AppContainer(
        settings=settings,
        jwt_validator=StaticInternalJwtValidator(
            public_key_pem=public_pem,
            issuer=ISSUER,
            audience=AUDIENCE,
        ),
        credentials=credentials,
        laliga_client=laliga_client,
        leagues_service=LeaguesService(
            credentials,
            LeaguesRepository(
                laliga_client,
                competition_id=settings.laliga_competition_id,
            ),
        ),
    )


def make_client(
    public_pem: str,
    fantasy_handler: Callable[[httpx.Request], httpx.Response],
) -> TestClient:
    container = build_leagues_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)
    return TestClient(app)


# ---- Happy path ---- #


def test_leagues_probe_returns_redacted_summary(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f"{FANTASY_ORIGIN}/api/v1/competition/1/leagues"
        assert request.headers["Authorization"] == f"Bearer {LALIGA_BEARER}"
        assert request.headers["Accept"] == "application/json"
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json=[{"id": "lg-1", "name": "Liga"}, {"id": 2}])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/laliga/leagues-probe",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body == {"ok": True, "league_count": 2, "league_ids": ["lg-1", 2]}
    assert LALIGA_BEARER not in response.text
    assert "bearer_token" not in body


def test_list_leagues_proxies_upstream_json(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    payload = [{"id": "lg-1", "name": "Liga"}]

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/competition/1/leagues"
        return httpx.Response(200, json=payload)

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 200
    assert response.json() == payload
    assert LALIGA_BEARER not in response.text


def test_list_leagues_omits_join_token(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    payload = [{"id": "lg-1", "name": "Liga", "token": "join-secret"}]

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body[0]["id"] == "lg-1"
    assert "token" not in body[0]
    assert "join-secret" not in response.text


@pytest.mark.parametrize(
    ("path", "expected_suffix", "upstream", "expected"),
    [
        (
            "/leagues/42/standing",
            "/api/v1/competition/1/leagues/42/standing",
            [{"position": 1, "points": 10}],
            [{"position": 1, "points": 10}],
        ),
        (
            "/leagues/42/standing/3",
            "/api/v1/competition/1/leagues/42/standing/3",
            [{"position": 2, "points": 5}],
            [{"position": 2, "points": 5}],
        ),
        (
            "/leagues/42/activity/0",
            "/api/v1/competition/1/leagues/42/activity/0",
            [{"id": "a1", "activityTypeId": 1}],
            [{"id": "a1", "activityTypeId": 1}],
        ),
        (
            "/leagues/42/teams",
            "/api/v1/competition/1/leagues/42/teams",
            [{"id": "99", "teamPoints": 1}],
            [{"id": "99", "teamPoints": 1}],
        ),
        (
            "/leagues/42/teams/99",
            "/api/v1/competition/1/leagues/42/teams/99",
            {"id": "99", "playersNumber": 15},
            {"id": "99", "playersNumber": 15},
        ),
    ],
)
def test_league_routes_proxy_expected_fantasy_paths(
    rsa_pems: tuple[str, str],
    path: str,
    expected_suffix: str,
    upstream: object,
    expected: object,
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == expected_suffix
        assert request.headers["Authorization"] == f"Bearer {LALIGA_BEARER}"
        return httpx.Response(200, json=upstream)

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(path, headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 200
    body = response.json()
    if isinstance(expected, list):
        assert isinstance(body, list)
        assert len(body) == len(expected)
        for actual_row, expected_row in zip(body, expected, strict=True):
            for key, value in expected_row.items():
                assert actual_row[key] == value
    else:
        for key, value in expected.items():
            assert body[key] == value
    assert LALIGA_BEARER not in response.text


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_json_returns_body() -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-lang"] == "es"
        return httpx.Response(200, json={"a": 1})

    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(handler),
    )

    # Act
    data = await client.get_json("/api/v1/competition/1/leagues", "tok")

    # Assert
    assert data == {"a": 1}


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_json_reuses_http_client() -> None:
    # Arrange
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"n": calls})

    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(handler),
    )

    # Act
    first = await client.get_json("/one", "tok")
    second = await client.get_json("/two", "tok")

    # Assert
    assert first == {"n": 1}
    assert second == {"n": 2}


@pytest.mark.asyncio
async def test_leagues_repository_list_leagues_builds_competition_path() -> None:
    # Arrange
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["authorization"] = request.headers["Authorization"]
        return httpx.Response(200, json=[{"id": 1}])

    repo = LeaguesRepository(
        LaligaFantasyClient(
            origin=FANTASY_ORIGIN,
            transport=httpx.MockTransport(handler),
        ),
        competition_id=1,
    )

    # Act
    data = await repo.list_leagues("tok")

    # Assert
    assert data == [{"id": 1}]
    assert seen["url"] == f"{FANTASY_ORIGIN}/api/v1/competition/1/leagues"
    assert seen["authorization"] == "Bearer tok"


@pytest.mark.asyncio
async def test_leagues_repository_get_standing_encodes_path_ids() -> None:
    # Arrange
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.raw_path.decode())
        return httpx.Response(200, json=[])

    repo = LeaguesRepository(
        LaligaFantasyClient(
            origin=FANTASY_ORIGIN,
            transport=httpx.MockTransport(handler),
        ),
        competition_id=1,
    )

    # Act
    await repo.get_standing("tok", "a/b")
    await repo.get_team("tok", "x y", "t?z")

    # Assert
    assert seen == [
        "/api/v1/competition/1/leagues/a%2Fb/standing",
        "/api/v1/competition/1/leagues/x%20y/teams/t%3Fz",
    ]


# ---- Error paths ---- #


def test_leagues_probe_rejects_missing_bearer(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/laliga/leagues-probe")

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


def test_list_leagues_maps_needs_reauth(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)
    container = build_leagues_container(
        public_pem,
        fantasy_handler=httpx.MockTransport(
            lambda _r: httpx.Response(200, json=[]),
        ),
        auth_handler=httpx.MockTransport(_auth_needs_reauth_handler),
    )
    app = create_app(settings=container.settings, container=container)
    set_container(container)

    with TestClient(app) as client:
        # Act
        response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "needs_reauth"
    assert LALIGA_BEARER not in response.text


def test_list_leagues_maps_fantasy_unauthorized(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="nope")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "fantasy_unauthorized"
    assert "nope" not in response.text
    assert LALIGA_BEARER not in response.text


def test_list_leagues_maps_fantasy_server_error(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream detail")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 503
    assert response.json()["error"] == "fantasy_error"
    assert "upstream detail" not in response.text


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_json_raises_upstream_on_500() -> None:
    # Arrange
    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(lambda _r: httpx.Response(500)),
    )

    # Act / Assert
    with pytest.raises(UpstreamError) as exc_info:
        await client.get_json("/x", "tok")
    assert exc_info.value.status_code == 500
    assert exc_info.value.category == "fantasy_error"


@pytest.mark.asyncio
async def test_laliga_fantasy_client_get_json_raises_upstream_on_invalid_json() -> None:
    # Arrange
    client = LaligaFantasyClient(
        origin=FANTASY_ORIGIN,
        transport=httpx.MockTransport(
            lambda _r: httpx.Response(200, text="<html>nope</html>"),
        ),
    )

    # Act / Assert
    with pytest.raises(UpstreamError, match="fantasy response was not JSON") as exc_info:
        await client.get_json("/x", "tok")
    assert exc_info.value.status_code == 502
    assert exc_info.value.category == "fantasy_error"


def test_list_leagues_maps_non_json_to_upstream_error(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>nope</html>")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"
    assert "<html>" not in response.text
    assert LALIGA_BEARER not in response.text


def test_list_leagues_maps_unexpected_payload_to_upstream_error(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json="not-a-collection")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"
    assert response.json()["detail"] == "fantasy payload had an unexpected shape"


def test_get_team_rejects_non_object_payload(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"id": "99"}])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues/42/teams/99",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 502
    assert response.json()["error"] == "fantasy_error"


# ---- Edge cases ---- #


def test_summarize_leagues_payload_handles_wrapped_and_empty() -> None:
    # Arrange / Act / Assert
    assert summarize_leagues_payload([{"id": 1}, {"name": "x"}]) == (2, [1])
    assert summarize_leagues_payload({"leagues": [{"id": "a"}]}) == (1, ["a"])
    assert summarize_leagues_payload({"data": [{"id": "b"}]}) == (1, ["b"])
    assert summarize_leagues_payload({"id": "solo"}) == (1, ["solo"])
    assert summarize_leagues_payload([]) == (0, [])


def test_summarize_leagues_payload_rejects_non_collection() -> None:
    # Arrange / Act / Assert
    with pytest.raises(ValueError):
        summarize_leagues_payload(None)
    with pytest.raises(ValueError):
        summarize_leagues_payload("x")
    with pytest.raises(ValueError):
        summarize_leagues_payload({"leagues": "bad"})
    with pytest.raises(ValueError):
        summarize_leagues_payload(["not-an-object"])


def test_leagues_probe_unwraps_data_wrapper(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(private_pem)

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "lg-1"}, {"id": "lg-2"}]})

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        list_response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )
        probe_response = client.get(
            "/laliga/leagues-probe",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert list_response.status_code == 200
    assert [row["id"] for row in list_response.json()] == ["lg-1", "lg-2"]
    assert probe_response.status_code == 200
    assert probe_response.json() == {
        "ok": True,
        "league_count": 2,
        "league_ids": ["lg-1", "lg-2"],
    }


def test_standing_route_rejects_invalid_jwt(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues/1/standing",
            headers={"Authorization": "Bearer not-a-jwt"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"


@pytest.mark.parametrize(
    ("issuer", "audience", "ttl_seconds"),
    [
        (ISSUER, AUDIENCE, -60),
        ("https://wrong-issuer.example", AUDIENCE, 300),
        (ISSUER, "not-fantasy-api", 300),
    ],
    ids=["expired", "wrong_issuer", "wrong_audience"],
)
def test_list_leagues_rejects_jwt_with_invalid_standard_claims(
    rsa_pems: tuple[str, str],
    issuer: str,
    audience: str,
    ttl_seconds: int,
) -> None:
    # Arrange
    private_pem, public_pem = rsa_pems
    token = mint_internal_jwt(
        private_pem,
        issuer=issuer,
        audience=audience,
        ttl_seconds=ttl_seconds,
    )

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get(
            "/leagues",
            headers={"Authorization": f"Bearer {token}"},
        )

    # Assert
    assert response.status_code == 401
    assert response.json()["error"] == "unauthorized"
    assert LALIGA_BEARER not in response.text


def test_standing_by_week_rejects_non_positive_week(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Fantasy must not be called for invalid week")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/leagues/1/standing/0")

    # Assert
    assert response.status_code == 422


def test_activity_rejects_negative_page(
    rsa_pems: tuple[str, str],
) -> None:
    # Arrange
    _private_pem, public_pem = rsa_pems

    def fantasy_handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Fantasy must not be called for invalid page")

    with make_client(public_pem, fantasy_handler) as client:
        # Act
        response = client.get("/leagues/1/activity/-1")

    # Assert
    assert response.status_code == 422
