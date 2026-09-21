# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import httpx
import pytest
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.http import (
    FantasyClient,
    _error_detail,
    _is_object,
    connection_linked,
    exchange_token,
)


def _token_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/auth/token"
    assert request.headers.get("X-CSRF-Token") == "csrf"
    assert request.headers.get("Origin") == "http://localhost:8000"
    return httpx.Response(
        200,
        json={"access_token": "jwt-token", "token_type": "Bearer", "expires_in": 900},
    )


# ---- Happy path ---- #


def test_exchange_token_valid_session_returns_jwt() -> None:
    # Arrange
    transport = httpx.MockTransport(_token_handler)

    # Act
    token = exchange_token(
        auth_base="http://auth.test",
        origin="http://localhost:8000",
        session="sess",
        csrf="csrf",
        transport=transport,
    )

    # Assert
    assert token == "jwt-token"


def test_connection_linked_true_payload_returns_true() -> None:
    # Arrange
    transport = httpx.MockTransport(
        lambda _r: httpx.Response(200, json={"linked": True}),
    )

    # Act
    linked = connection_linked(
        auth_base="http://auth.test",
        session="sess",
        csrf="csrf",
        transport=transport,
    )

    # Assert
    assert linked is True


# ---- Error paths ---- #


def test_exchange_token_unauthorized_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(
        lambda _r: httpx.Response(
            401,
            json={"error": "unauthorized", "detail": "csrf failed"},
        ),
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="csrf failed"):
        exchange_token(
            auth_base="http://auth.test",
            origin="http://localhost:8000",
            session="sess",
            csrf="csrf",
            transport=transport,
        )


def test_connection_linked_unauthorized_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(401))

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="unauthorized"):
        connection_linked(
            auth_base="http://auth.test",
            session="sess",
            csrf="csrf",
            transport=transport,
        )


def test_exchange_token_missing_access_token_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(200, json={}))

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="missing access_token"):
        exchange_token(
            auth_base="http://auth.test",
            origin="http://localhost:8000",
            session="sess",
            csrf="csrf",
            transport=transport,
        )


def test_connection_linked_http_error_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(503, text="down"))

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="HTTP 503"):
        connection_linked(
            auth_base="http://auth.test",
            session="sess",
            csrf="csrf",
            transport=transport,
        )


def test_fantasy_client_put_json_empty_body_returns_dict() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(200, content=b""))
    client = FantasyClient(
        base_url="http://api.test",
        jwt="jwt",
        transport=transport,
    )

    # Act
    result = client.put_json("/teams/1/lineup", {"formation": []})

    # Assert
    assert result == {}


def test_fantasy_client_put_json_non_json_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(200, text="not-json"))
    client = FantasyClient(
        base_url="http://api.test",
        jwt="jwt",
        transport=transport,
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="non-JSON"):
        client.put_json("/teams/1/lineup", {"formation": []})


def test_fantasy_client_put_json_http_error_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(
        lambda _r: httpx.Response(400, json={"error": "bad", "detail": "shape"}),
    )
    client = FantasyClient(
        base_url="http://api.test",
        jwt="jwt",
        transport=transport,
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="shape"):
        client.put_json("/teams/1/lineup", {"formation": []})


# ---- Edge cases ---- #


def test_error_detail_non_json_returns_status() -> None:
    # Arrange
    response = httpx.Response(502, text="upstream")

    # Act / Assert
    assert _error_detail(response) == "HTTP 502"


def test_error_detail_non_object_json_returns_status() -> None:
    # Arrange
    response = httpx.Response(500, json=["oops"])

    # Act / Assert
    assert _error_detail(response) == "HTTP 500"


def test_is_object_invalid_json_returns_false() -> None:
    # Arrange
    response = httpx.Response(200, text="nope")

    # Act / Assert
    assert _is_object(response) is False
