# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from typing import Any

import httpx
import pytest
from fantasy_auth.cli import pair as pair_cli

# ---- Happy path ---- #


def test_normalize_cookie_strips_newlines() -> None:
    # Arrange
    raw = "\ncd2b75d1-737a-4391-85ab-1abdcc02a0a0\n"

    # Act
    result = pair_cli._normalize_cookie(raw)

    # Assert
    assert result == "cd2b75d1-737a-4391-85ab-1abdcc02a0a0"


def test_create_pairing_200_returns_fields() -> None:
    # Arrange
    body = {
        "pairing_id": "p-1",
        "secret": "s-1",
        "nonce": "n-1",
        "expires_at": "2026-01-01T00:00:00Z",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/laliga/pairings"
        assert request.headers["x-csrf-token"] == "csrf"
        return httpx.Response(200, json=body)

    # Act — patch Client to use MockTransport
    original = httpx.Client

    class TransportClient(httpx.Client):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    import fantasy_auth.cli.pair as mod

    # temporarily replace
    mod.httpx.Client = TransportClient  # type: ignore[misc]
    try:
        result = pair_cli._create_pairing(
            api_base="http://auth.test",
            session="sess",
            csrf="csrf",
            origin="http://localhost:8000",
        )
    finally:
        mod.httpx.Client = original  # type: ignore[misc]

    # Assert
    assert result == {
        "pairing_id": "p-1",
        "secret": "s-1",
        "nonce": "n-1",
        "expires_at": "2026-01-01T00:00:00Z",
    }


def test_main_success_invokes_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        pair_cli,
        "_create_pairing",
        lambda **_k: {
            "pairing_id": "p-1",
            "secret": "s-1",
            "nonce": "n-1",
            "expires_at": "t",
        },
    )
    called: dict[str, list[str]] = {}

    def fake_helper(argv: list[str] | None = None) -> int:
        called["argv"] = list(argv or [])
        return 0

    monkeypatch.setattr(pair_cli.laliga_helper, "main", fake_helper)

    # Act
    code = pair_cli.main(
        [
            "--session",
            "sess",
            "--csrf",
            "csrf",
            "--api-base",
            "http://localhost:8000",
        ]
    )

    # Assert
    assert code == 0
    assert "--pairing" in called["argv"]
    assert "p-1" in called["argv"]
    assert "--clipboard" in called["argv"]


# ---- Error paths ---- #


def test_main_missing_cookies_returns_one() -> None:
    # Arrange / Act
    code = pair_cli.main(["--api-base", "http://localhost:8000"])

    # Assert
    assert code == 1


def test_create_pairing_401_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    class TransportClient(httpx.Client):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(pair_cli.httpx, "Client", TransportClient)

    # Act
    result = pair_cli._create_pairing(
        api_base="http://auth.test",
        session="sess",
        csrf="csrf",
        origin="http://localhost:8000",
    )

    # Assert
    assert result is None


def test_create_pairing_missing_keys_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"pairing_id": "only"})

    class TransportClient(httpx.Client):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(pair_cli.httpx, "Client", TransportClient)

    # Act
    result = pair_cli._create_pairing(
        api_base="http://auth.test",
        session="sess",
        csrf="csrf",
        origin="http://localhost:8000",
    )

    # Assert
    assert result is None


# ---- Edge cases ---- #


def test_main_callback_file_forwards_to_helper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        pair_cli,
        "_create_pairing",
        lambda **_k: {
            "pairing_id": "p-1",
            "secret": "s-1",
            "nonce": "n-1",
            "expires_at": "t",
        },
    )
    captured: list[str] = []

    monkeypatch.setattr(
        pair_cli.laliga_helper,
        "main",
        lambda argv=None: captured.extend(argv or []) or 0,
    )

    # Act
    code = pair_cli.main(
        [
            "--session",
            "s",
            "--csrf",
            "c",
            "--callback-file",
            "/tmp/cb.txt",
        ]
    )

    # Assert
    assert code == 0
    assert "--callback-file" in captured
    assert "/tmp/cb.txt" in captured


def test_main_pairing_create_failed_returns_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(pair_cli, "_create_pairing", lambda **_k: None)

    # Act
    code = pair_cli.main(["--session", "s", "--csrf", "c"])

    # Assert
    assert code == 1


def test_main_stdin_does_not_add_clipboard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        pair_cli,
        "_create_pairing",
        lambda **_k: {
            "pairing_id": "p-1",
            "secret": "s-1",
            "nonce": "n-1",
            "expires_at": "t",
        },
    )
    captured: list[str] = []
    monkeypatch.setattr(
        pair_cli.laliga_helper,
        "main",
        lambda argv=None: captured.extend(argv or []) or 0,
    )

    # Act
    code = pair_cli.main(
        ["--session", "s", "--csrf", "c", "--stdin"],
    )

    # Assert
    assert code == 0
    assert "--clipboard" not in captured
    assert "--callback-file" not in captured


def test_create_pairing_http_error_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="nope")

    class TransportClient(httpx.Client):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(pair_cli.httpx, "Client", TransportClient)

    # Act
    result = pair_cli._create_pairing(
        api_base="http://auth.test",
        session="sess",
        csrf="csrf",
        origin="http://localhost:8000",
    )

    # Assert
    assert result is None
