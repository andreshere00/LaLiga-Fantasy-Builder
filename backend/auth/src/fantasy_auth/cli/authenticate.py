"""End-to-end local setup and interactive LaLiga account pairing."""

from __future__ import annotations

import argparse
import base64
import getpass
import os
import secrets
import shutil
import subprocess
import sys
import time
import webbrowser
from contextlib import chdir
from pathlib import Path
from urllib.parse import urlparse

import httpx

from fantasy_auth.cli.pair import main as pair_laliga

DEFAULT_API_BASE = "http://localhost:8000"


class SetupError(RuntimeError):
    """Local authentication setup could not be completed."""


def main(argv: list[str] | None = None) -> int:
    """Prepare local auth, log in, pair LaLiga, and verify the connection.

    The OIDC and LaLiga consent pages remain interactive. Browser security
    prevents this CLI from reading the HttpOnly session cookie, so users must
    paste the session and CSRF cookie values once.

    Args:
        argv: Optional CLI arguments.

    Returns:
        Process exit code.
    """
    args = _parse_args(argv)
    auth_process: subprocess.Popen[bytes] | None = None

    try:
        repo_root = _find_repo_root(args.repo_root)
        auth_dir = repo_root / "backend" / "auth"
        _require_command("uv")
        _ensure_env_file(auth_dir)

        if not args.skip_keycloak:
            _require_command("docker")
            _run(
                ["docker", "compose", "up", "-d", "keycloak"],
                cwd=repo_root,
            )

        if not args.skip_sync:
            _run(["uv", "sync", "--all-extras"], cwd=auth_dir)

        if not _is_healthy(args.api_base):
            if args.skip_server:
                raise SetupError(f"auth service is not healthy at {args.api_base}")
            auth_process = _start_auth_server(auth_dir, args.api_base)
            _wait_for_health(args.api_base, process=auth_process)

        login_url = f"{args.api_base.rstrip('/')}/auth/login"
        print(f"\nOpening application login: {login_url}", file=sys.stderr)
        if not args.no_browser:
            webbrowser.open(login_url)

        session = args.session or _read_secret(
            "\nAfter app login, open browser developer tools → Application → "
            "Cookies → localhost and paste fantasy_session: "
        )
        csrf = args.csrf or _read_secret("Paste fantasy_csrf: ")

        pair_args = [
            "--api-base",
            args.api_base,
            "--origin",
            args.origin,
            "--session",
            session,
            "--csrf",
            csrf,
        ]
        if args.callback_file:
            pair_args.extend(["--callback-file", args.callback_file])
        elif args.stdin:
            pair_args.append("--stdin")
        elif args.clipboard:
            pair_args.append("--clipboard")
        elif sys.platform != "darwin":
            pair_args.append("--stdin")
        else:
            pair_args.append("--clipboard")

        with chdir(auth_dir):
            result = pair_laliga(pair_args)
        if result != 0:
            return result

        status = _get_connection_status(
            api_base=args.api_base,
            session=session,
            csrf=csrf,
        )
        if not status.get("linked"):
            raise SetupError("pairing completed but connection is not linked")

        print(
            "\nLaLiga account linked successfully: "
            f"{status.get('manager_name') or status.get('manager_id') or 'manager'}",
            file=sys.stderr,
        )

        if auth_process is not None and args.keep_server:
            print(
                "The local auth server holds this connection in memory. "
                "It will remain running; press Ctrl+C to stop it.",
                file=sys.stderr,
            )
            _wait_for_server(auth_process)
        return 0
    except (SetupError, OSError, httpx.HTTPError) as exc:
        print(f"Authentication setup failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if auth_process is not None and auth_process.poll() is None:
            auth_process.terminate()
            try:
                auth_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                auth_process.kill()


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description=(
            "Start local auth dependencies, open app login, pair a real LaLiga "
            "account, and verify the connection."
        )
    )
    parser.add_argument("--repo-root", type=Path, default=None)
    parser.add_argument(
        "--api-base",
        default=os.environ.get("FANTASY_API_BASE", DEFAULT_API_BASE),
    )
    parser.add_argument(
        "--origin",
        default=os.environ.get("FANTASY_ORIGIN", DEFAULT_API_BASE),
    )
    parser.add_argument(
        "--session",
        default=os.environ.get("FANTASY_SESSION"),
        help="Session cookie; omit to enter it securely.",
    )
    parser.add_argument(
        "--csrf",
        default=os.environ.get("FANTASY_CSRF"),
        help="CSRF cookie; omit to enter it securely.",
    )
    parser.add_argument("--skip-keycloak", action="store_true")
    parser.add_argument("--skip-sync", action="store_true")
    parser.add_argument("--skip-server", action="store_true")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument(
        "--keep-server",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Keep a CLI-started memory auth server alive after pairing.",
    )
    callback = parser.add_mutually_exclusive_group()
    callback.add_argument("--clipboard", action="store_true")
    callback.add_argument("--callback-file")
    callback.add_argument("--stdin", action="store_true")
    return parser.parse_args(argv)


def _find_repo_root(explicit: Path | None = None) -> Path:
    """Locate the repository containing docker-compose and backend/auth."""
    if explicit is not None:
        candidates = [explicit.resolve()]
    else:
        candidates = [Path.cwd().resolve()]
        candidates.extend(Path.cwd().resolve().parents)
        candidates.extend(Path(__file__).resolve().parents)

    for candidate in candidates:
        if (candidate / "docker-compose.yml").is_file() and (
            candidate / "backend" / "auth"
        ).is_dir():
            return candidate
    raise SetupError("repository root not found; pass --repo-root")


def _require_command(command: str) -> None:
    """Require an executable on PATH."""
    if shutil.which(command) is None:
        raise SetupError(f"required command not found: {command}")


def _ensure_env_file(auth_dir: Path) -> None:
    """Create backend/auth/.env from the example without overwriting it."""
    env_path = auth_dir / ".env"
    if env_path.exists():
        return
    example = auth_dir / ".env.example"
    if not example.exists():
        raise SetupError(f"missing environment template: {example}")
    shutil.copyfile(example, env_path)
    print(f"Created {env_path} from .env.example", file=sys.stderr)


def _run(command: list[str], *, cwd: Path) -> None:
    """Run a setup command and raise a stable error on failure."""
    try:
        subprocess.run(command, cwd=cwd, check=True)
    except subprocess.CalledProcessError as exc:
        raise SetupError(f"command failed ({exc.returncode}): {' '.join(command)}") from exc


def _start_auth_server(
    auth_dir: Path,
    api_base: str,
) -> subprocess.Popen[bytes]:
    """Start a local in-memory auth server."""
    parsed = urlparse(api_base)
    if parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise SetupError("automatic server startup supports localhost only")
    port = parsed.port or 8000
    runtime_env = os.environ.copy()
    runtime_env.update(
        {
            "USE_MEMORY_STORE": "true",
            "COOKIE_SECURE": "false",
            "TOKEN_VAULT_KEY_BASE64": base64.b64encode(secrets.token_bytes(32)).decode(),
        }
    )
    print(f"Starting local auth service on port {port}...", file=sys.stderr)
    return subprocess.Popen(
        [
            "uv",
            "run",
            "uvicorn",
            "fantasy_auth.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=auth_dir,
        env=runtime_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _is_healthy(api_base: str) -> bool:
    """Return whether the auth health endpoint responds successfully."""
    try:
        response = httpx.get(
            f"{api_base.rstrip('/')}/health",
            timeout=1.0,
        )
    except httpx.HTTPError:
        return False
    return response.is_success


def _wait_for_health(
    api_base: str,
    *,
    process: subprocess.Popen[bytes],
    timeout_seconds: float = 30.0,
) -> None:
    """Wait until auth is healthy or its process exits."""
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise SetupError(f"auth server exited before becoming healthy ({process.returncode})")
        if _is_healthy(api_base):
            return
        time.sleep(0.25)
    raise SetupError(f"auth service did not become healthy at {api_base}")


def _read_secret(prompt: str) -> str:
    """Read a non-empty sensitive value without terminal echo."""
    value = getpass.getpass(prompt).strip()
    if not value:
        raise SetupError("cookie value cannot be empty")
    return value


def _get_connection_status(
    *,
    api_base: str,
    session: str,
    csrf: str,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, object]:
    """Fetch and validate the authenticated user's connection status."""
    with httpx.Client(
        transport=transport,
        timeout=10.0,
        cookies={
            "fantasy_session": session,
            "fantasy_csrf": csrf,
        },
    ) as client:
        response = client.get(f"{api_base.rstrip('/')}/laliga/connection")
    if not response.is_success:
        raise SetupError(f"connection check failed: HTTP {response.status_code}")
    data = response.json()
    if not isinstance(data, dict):
        raise SetupError("connection check returned an invalid response")
    return data


def _wait_for_server(process: subprocess.Popen[bytes]) -> None:
    """Wait for the owned memory server until interrupted."""
    try:
        process.wait()
    except KeyboardInterrupt:
        print("\nStopping local auth server...", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
