# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import subprocess
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest
from fantasy_auth.cli import authenticate as auth_cli
from fantasy_auth.cli.authenticate import (
    SetupError,
    _ensure_env_file,
    _find_repo_root,
    _get_connection_status,
    _is_healthy,
    _read_secret,
    _require_command,
    _run,
    _start_auth_server,
    _wait_for_health,
    _wait_for_server,
)


def _stub_repo(tmp_path: Path) -> Path:
    """Create a minimal repo layout under ``tmp_path``."""
    (tmp_path / "docker-compose.yml").touch()
    (tmp_path / "backend" / "auth").mkdir(parents=True)
    (tmp_path / "backend" / "auth" / ".env").write_text("x=1\n", encoding="utf-8")
    return tmp_path


def _patch_main_basics(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Mock repo discovery and setup steps that ``main`` always runs."""
    monkeypatch.setattr(auth_cli, "_find_repo_root", lambda _p: _stub_repo(tmp_path))
    monkeypatch.setattr(auth_cli, "_require_command", lambda _c: None)
    monkeypatch.setattr(auth_cli, "_ensure_env_file", lambda _d: None)

# ---- Happy path ---- #


def test_find_repo_root_walks_parents_from_cwd(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    repo = _stub_repo(tmp_path)
    nested = repo / "backend" / "auth" / "nested"
    nested.mkdir(parents=True)
    monkeypatch.chdir(nested)

    # Act
    result = _find_repo_root(None)

    # Assert
    assert result == repo


def test_read_secret_nonempty_returns_stripped_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr("getpass.getpass", lambda _prompt: "  secret-value  ")

    # Act
    result = _read_secret("Token: ")

    # Assert
    assert result == "secret-value"


def test_is_healthy_non_success_returns_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        auth_cli.httpx,
        "get",
        lambda *_a, **_k: SimpleNamespace(is_success=False),
    )

    # Act / Assert
    assert _is_healthy("http://localhost:8000") is False


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
    assert (tmp_path / ".env").read_text(encoding="utf-8") == ("USE_MEMORY_STORE=true\n")


def test_require_command_present_passes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(auth_cli.shutil, "which", lambda _c: "/usr/bin/uv")

    # Act / Assert
    _require_command("uv")


def test_run_success_invokes_subprocess(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    called: dict[str, Any] = {}

    def fake_run(cmd: list[str], *, cwd: Path, check: bool) -> None:
        called["cmd"] = cmd
        called["cwd"] = cwd
        called["check"] = check

    monkeypatch.setattr(auth_cli.subprocess, "run", fake_run)

    # Act
    _run(["echo", "ok"], cwd=tmp_path)

    # Assert
    assert called["cmd"] == ["echo", "ok"]
    assert called["check"] is True


def test_start_auth_server_localhost_starts_popen(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    fake_proc = MagicMock()
    monkeypatch.setattr(
        auth_cli.subprocess,
        "Popen",
        lambda *a, **k: fake_proc,
    )

    # Act
    proc = _start_auth_server(tmp_path, "http://127.0.0.1:8000")

    # Assert
    assert proc is fake_proc


def test_is_healthy_success_returns_true(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        auth_cli.httpx,
        "get",
        lambda *_a, **_k: SimpleNamespace(is_success=True),
    )

    # Act / Assert
    assert _is_healthy("http://localhost:8000") is True


def test_wait_for_health_becomes_healthy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    process = MagicMock()
    process.poll.return_value = None
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)

    # Act / Assert
    _wait_for_health("http://localhost:8000", process=process)


def test_wait_for_server_handles_keyboard_interrupt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    process = MagicMock()
    process.wait.side_effect = KeyboardInterrupt()

    # Act / Assert
    _wait_for_server(process)


def test_main_happy_path_heavily_mocked(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True, "manager_name": "Mgr"},
    )

    # Act
    code = auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "sess",
            "--csrf",
            "csrf",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert code == 0


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


def test_require_command_missing_raises_setup_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(auth_cli.shutil, "which", lambda _c: None)

    # Act / Assert
    with pytest.raises(SetupError, match="required command not found"):
        _require_command("missing-bin")


def test_run_failure_raises_setup_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    def boom(*_a: Any, **_k: Any) -> None:
        raise subprocess.CalledProcessError(2, ["bad"])

    monkeypatch.setattr(auth_cli.subprocess, "run", boom)

    # Act / Assert
    with pytest.raises(SetupError, match="command failed"):
        _run(["bad"], cwd=tmp_path)


def test_is_healthy_http_error_returns_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    def boom(*_a: Any, **_k: Any) -> None:
        raise httpx.ConnectError("down")

    monkeypatch.setattr(auth_cli.httpx, "get", boom)

    # Act / Assert
    assert _is_healthy("http://localhost:8000") is False


def test_wait_for_health_process_exits_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    process = MagicMock()
    process.poll.return_value = 1
    process.returncode = 1
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: False)

    # Act / Assert
    with pytest.raises(SetupError, match="exited before becoming healthy"):
        _wait_for_health("http://localhost:8000", process=process)


def test_start_auth_server_non_localhost_raises(tmp_path: Path) -> None:
    # Arrange / Act / Assert
    with pytest.raises(SetupError, match="localhost only"):
        _start_auth_server(tmp_path, "http://example.com:8000")


def test_main_setup_error_returns_one(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    monkeypatch.setattr(
        auth_cli,
        "_find_repo_root",
        lambda _p: (_ for _ in ()).throw(SetupError("boom")),
    )

    # Act
    code = auth_cli.main(["--repo-root", str(tmp_path), "--skip-keycloak", "--skip-sync"])

    # Assert
    assert code == 1


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


def test_wait_for_health_timeout_raises_setup_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    process = MagicMock()
    process.poll.return_value = None
    times = iter([0.0, 0.0, 31.0])

    monkeypatch.setattr(auth_cli.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: False)

    # Act / Assert
    with pytest.raises(SetupError, match="did not become healthy"):
        _wait_for_health("http://localhost:8000", process=process, timeout_seconds=30.0)


def test_get_connection_status_non_object_json_raises_setup_error() -> None:
    # Arrange
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, json=["not", "a", "dict"])
    )

    # Act / Assert
    with pytest.raises(SetupError, match="invalid response"):
        _get_connection_status(
            api_base="http://auth.test",
            session="session-1",
            csrf="csrf-1",
            transport=transport,
        )


def test_main_runs_keycloak_compose_when_not_skipped(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    calls: list[list[str]] = []

    def capture_run(cmd: list[str], *, cwd: Path) -> None:
        calls.append(cmd)

    monkeypatch.setattr(auth_cli, "_run", capture_run)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    code = auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert code == 0
    assert ["docker", "compose", "up", "-d", "keycloak"] in calls
    assert ["uv", "sync", "--all-extras"] not in calls


def test_main_runs_uv_sync_when_not_skipped(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    calls: list[list[str]] = []

    def capture_run(cmd: list[str], *, cwd: Path) -> None:
        calls.append(cmd)

    monkeypatch.setattr(auth_cli, "_run", capture_run)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert ["uv", "sync", "--all-extras"] in calls


def test_main_unhealthy_with_skip_server_returns_one(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: False)

    # Act
    code = auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--skip-server",
        ]
    )

    # Assert
    assert code == 1
    assert "not healthy" in capsys.readouterr().err


def test_main_starts_auth_server_when_unhealthy(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: False)
    fake_proc = MagicMock()
    fake_proc.poll.return_value = None
    started: dict[str, subprocess.Popen[bytes]] = {}

    def fake_start(_auth_dir: Path, _api_base: str) -> subprocess.Popen[bytes]:
        started["proc"] = fake_proc
        return fake_proc

    monkeypatch.setattr(auth_cli, "_start_auth_server", fake_start)
    monkeypatch.setattr(auth_cli, "_wait_for_health", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    code = auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert code == 0
    assert started["proc"] is fake_proc
    fake_proc.terminate.assert_called_once()


def test_main_opens_browser_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    opened: list[str] = []
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda url: opened.append(url))
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--session",
            "s",
            "--csrf",
            "c",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert opened == ["http://localhost:8000/auth/login"]


@pytest.mark.parametrize(
    ("extra_args", "expected_flag"),
    [
        (["--callback-file", "/tmp/callback.txt"], "--callback-file"),
        (["--stdin"], "--stdin"),
        (["--clipboard"], "--clipboard"),
    ],
)
def test_main_forwards_callback_mode_to_pair_cli(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    extra_args: list[str],
    expected_flag: str,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    captured: list[list[str]] = []
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda args: captured.append(args) or 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--no-keep-server",
            *extra_args,
        ]
    )

    # Assert
    assert expected_flag in captured[0]


def test_main_defaults_to_clipboard_on_darwin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    captured: list[list[str]] = []
    monkeypatch.setattr(auth_cli.sys, "platform", "darwin")
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda args: captured.append(args) or 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--no-keep-server",
        ]
    )

    # Assert
    assert "--clipboard" in captured[0]


def test_main_defaults_to_stdin_off_darwin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    captured: list[list[str]] = []
    monkeypatch.setattr(auth_cli.sys, "platform", "linux")
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda args: captured.append(args) or 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--no-keep-server",
        ]
    )

    # Assert
    assert "--stdin" in captured[0]


def test_main_pair_failure_returns_pair_exit_code(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 2)

    # Act
    code = auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert code == 2


def test_main_unlinked_connection_returns_one(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": False},
    )

    # Act
    code = auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert code == 1
    assert "not linked" in capsys.readouterr().err


def test_main_keep_server_waits_for_auth_process(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: False)
    fake_proc = MagicMock()
    fake_proc.poll.return_value = None
    waited: list[subprocess.Popen[bytes]] = []

    monkeypatch.setattr(auth_cli, "_start_auth_server", lambda *_a, **_k: fake_proc)
    monkeypatch.setattr(auth_cli, "_wait_for_health", lambda *_a, **_k: None)
    monkeypatch.setattr(
        auth_cli,
        "_wait_for_server",
        lambda proc: waited.append(proc),
    )
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True, "manager_name": "Mgr"},
    )

    # Act
    code = auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--stdin",
            "--keep-server",
        ]
    )

    # Assert
    assert code == 0
    assert waited == [fake_proc]


def test_main_reads_cookies_via_getpass_when_omitted(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    prompts: list[str] = []
    monkeypatch.setattr(
        "getpass.getpass",
        lambda prompt: prompts.append(prompt) or ("sess" if "session" in prompt else "csrf"),
    )
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: True)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    captured: list[list[str]] = []
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda args: captured.append(args) or 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert len(prompts) == 2
    assert "--session" in captured[0]
    assert captured[0][captured[0].index("--session") + 1] == "sess"


def test_main_finally_kills_server_when_terminate_times_out(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    _patch_main_basics(monkeypatch, tmp_path)
    monkeypatch.setattr(auth_cli, "_run", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli, "_is_healthy", lambda _b: False)
    fake_proc = MagicMock()
    fake_proc.poll.return_value = None
    fake_proc.wait.side_effect = subprocess.TimeoutExpired(cmd="uvicorn", timeout=5)
    monkeypatch.setattr(auth_cli, "_start_auth_server", lambda *_a, **_k: fake_proc)
    monkeypatch.setattr(auth_cli, "_wait_for_health", lambda *_a, **_k: None)
    monkeypatch.setattr(auth_cli.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(auth_cli, "pair_laliga", lambda _args: 0)
    monkeypatch.setattr(
        auth_cli,
        "_get_connection_status",
        lambda **_k: {"linked": True},
    )

    # Act
    code = auth_cli.main(
        [
            "--repo-root",
            str(tmp_path),
            "--skip-keycloak",
            "--skip-sync",
            "--no-browser",
            "--session",
            "s",
            "--csrf",
            "c",
            "--stdin",
            "--no-keep-server",
        ]
    )

    # Assert
    assert code == 0
    fake_proc.kill.assert_called_once()
