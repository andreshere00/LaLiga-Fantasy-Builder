# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import httpx
import pytest
from fantasy_auth.cli.browser_session.http import connection_linked, exchange_token
from fantasy_auth.cli.browser_session.errors import BrowserSessionError


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
