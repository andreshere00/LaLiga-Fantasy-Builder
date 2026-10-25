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
)


def _valid_lineup() -> dict[str, object]:
    """Return a valid full-replacement lineup body."""
    return {
        "goalkeeper": "gk-1",
        "defender": ["def-1"],
        "midfield": ["mid-1"],
        "striker": ["str-1"],
        "tactical_formation": [1, 3, 4, 3],
    }


# ---- Happy path ---- #


def test_connection_linked_true_payload_returns_true() -> None:
    # Arrange
    transport = httpx.MockTransport(
        lambda _r: httpx.Response(200, json={"linked": True}),
    )

    # Act
    linked = connection_linked(
        auth_base="http://auth.test",
        jwt="jwt",
        transport=transport,
    )

    # Assert
    assert linked is True


# ---- Error paths ---- #


def test_connection_linked_unauthorized_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(401))

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="HTTP 401"):
        connection_linked(
            auth_base="http://auth.test",
            jwt="jwt",
            transport=transport,
        )


def test_connection_linked_http_error_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(503, text="down"))

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="HTTP 503"):
        connection_linked(
            auth_base="http://auth.test",
            jwt="jwt",
            transport=transport,
        )


def test_fantasy_client_put_json_empty_body_raises_contract_error() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(200, content=b""))
    client = FantasyClient(
        base_url="http://api.test",
        jwt="jwt",
        transport=transport,
    )

    # Act
    with pytest.raises(BrowserSessionError, match="invalid response"):
        client.put_json("/teams/1/lineup", _valid_lineup())


def test_fantasy_client_put_json_non_json_raises() -> None:
    # Arrange
    transport = httpx.MockTransport(lambda _r: httpx.Response(200, text="not-json"))
    client = FantasyClient(
        base_url="http://api.test",
        jwt="jwt",
        transport=transport,
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="invalid response"):
        client.put_json("/teams/1/lineup", _valid_lineup())


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
        client.put_json("/teams/1/lineup", _valid_lineup())


def test_fantasy_client_put_json_invalid_request_does_not_send() -> None:
    # Arrange
    sent = False

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal sent
        sent = True
        return httpx.Response(200, json={"formation": {}})

    client = FantasyClient(
        base_url="http://api.test",
        jwt="jwt",
        transport=httpx.MockTransport(handler),
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="invalid request"):
        client.put_json("/teams/1/lineup", {"formation": []})
    assert sent is False


def test_fantasy_client_get_json_malformed_response_raises_contract_error() -> None:
    # Arrange
    client = FantasyClient(
        base_url="http://api.test",
        jwt="jwt",
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(200, json={"marketPlayers": "bad"}),
        ),
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="invalid response"):
        client.get_json("/market/leagues/123")


def test_fantasy_client_unknown_route_fails_before_request() -> None:
    # Arrange
    sent = False

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal sent
        sent = True
        return httpx.Response(200, json={})

    client = FantasyClient(
        base_url="http://api.test",
        jwt="jwt",
        transport=httpx.MockTransport(handler),
    )

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="no browser-session response contract"):
        client.get_json("/unmodeled")
    assert sent is False


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
