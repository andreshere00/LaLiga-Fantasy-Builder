# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from fantasy_auth.cli.authenticate import (
    SetupError,
    _ensure_env_file,
    _find_repo_root,
    _get_connection_status,
    _read_secret,
)

# ---- Happy path ---- #


def test_find_repo_root_explicit_valid_path_returns_root(tmp_path: Path) -> None:
    # Arrange
    (tmp_path / "docker-compose.yml").touch()
    (tmp_path / "backend" / "auth").mkdir(parents=True)

    # Act
    result = _find_repo_root(tmp_path)

    # Assert
    assert result == tmp_path


def test_ensure_env_file_missing_file_copies_example(tmp_path: Path) -> None:
    # Arrange
    example = tmp_path / ".env.example"
    example.write_text("USE_MEMORY_STORE=true\n", encoding="utf-8")

    # Act
    _ensure_env_file(tmp_path)

    # Assert
    assert (tmp_path / ".env").read_text(encoding="utf-8") == (
        "USE_MEMORY_STORE=true\n"
    )


def test_get_connection_status_linked_response_returns_data() -> None:
    # Arrange
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/laliga/connection"
        assert "fantasy_session=session-1" in request.headers["cookie"]
        return httpx.Response(
            200,
            json={
                "linked": True,
                "needs_reauth": False,
                "manager_id": "manager-1",
                "manager_name": "Manager",
            },
        )

    # Act
    result = _get_connection_status(
        api_base="http://auth.test",
        session="session-1",
        csrf="csrf-1",
        transport=httpx.MockTransport(handler),
    )

    # Assert
    assert result["linked"] is True
    assert result["manager_id"] == "manager-1"


# ---- Error paths ---- #


def test_find_repo_root_invalid_path_raises_setup_error(tmp_path: Path) -> None:
    # Arrange / Act / Assert
    with pytest.raises(SetupError, match="repository root not found"):
        _find_repo_root(tmp_path)


def test_ensure_env_file_missing_template_raises_setup_error(
    tmp_path: Path,
) -> None:
    # Arrange / Act / Assert
    with pytest.raises(SetupError, match="missing environment template"):
        _ensure_env_file(tmp_path)


def test_get_connection_status_unauthorized_raises_setup_error() -> None:
    # Arrange
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(401, json={"error": "unauthorized"})
    )

    # Act / Assert
    with pytest.raises(SetupError, match="HTTP 401"):
        _get_connection_status(
            api_base="http://auth.test",
            session="bad-session",
            csrf="bad-csrf",
            transport=transport,
        )


# ---- Edge cases ---- #


def test_ensure_env_file_existing_file_is_not_overwritten(tmp_path: Path) -> None:
    # Arrange
    env_path = tmp_path / ".env"
    env_path.write_text("EXISTING=true\n", encoding="utf-8")
    (tmp_path / ".env.example").write_text("EXISTING=false\n", encoding="utf-8")

    # Act
    _ensure_env_file(tmp_path)

    # Assert
    assert env_path.read_text(encoding="utf-8") == "EXISTING=true\n"


def test_read_secret_empty_value_raises_setup_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr("getpass.getpass", lambda _prompt: "")

    # Act / Assert
    with pytest.raises(SetupError, match="cannot be empty"):
        _read_secret("Secret: ")
