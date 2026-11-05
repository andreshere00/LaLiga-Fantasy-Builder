"""Prepare missing scouting settings and storage for the host development stack."""

from __future__ import annotations

import os
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def _read(path: Path) -> dict[str, str]:
    """Read dotenv values without executing shell code or expanding other secrets."""
    return {key: value for key, value in dotenv_values(path, interpolate=False).items() if value}


def _append(path: Path, key: str, value: str) -> None:
    """Append an effective dotenv assignment without replacing existing settings."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    with path.open("a", encoding="utf-8") as stream:
        stream.write(f'\n{key}="{escaped}"\n')


def prepare(root: Path = ROOT) -> None:
    """Prepare a shared local token and provision only the default Compose app DB.

    Existing custom database URLs and non-empty service settings are preserved.
    Secrets are neither printed nor passed through shell evaluation.
    """
    root_path = root / ".env"
    api_path = root / "backend/api/.env"
    auth_path = root / "backend/auth/.env"
    shared, api, auth = (_read(path) for path in (root_path, api_path, auth_path))
    inherited = os.environ.get("SCOUTING_SERVICE_TOKEN")
    tokens = {
        data["SCOUTING_SERVICE_TOKEN"]
        for data in (shared, api, auth)
        if data.get("SCOUTING_SERVICE_TOKEN")
    }
    if not inherited and len(tokens) > 1:
        raise RuntimeError(
            "SCOUTING_SERVICE_TOKEN differs between local .env files; align it first"
        )
    token = inherited or next(iter(tokens), None) or secrets.token_urlsafe(32)
    for path, values in ((root_path, shared), (api_path, api), (auth_path, auth)):
        if not values.get("SCOUTING_SERVICE_TOKEN"):
            _append(path, "SCOUTING_SERVICE_TOKEN", token)

    configured_url = os.environ.get("SCOUTING_DATABASE_URL") or api.get("SCOUTING_DATABASE_URL")
    password = shared.get("APP_DB_PASSWORD") or "app_dev"
    port = shared.get("POSTGRES_PUBLISH_PORT", "5432")
    default_url = (
        f"postgresql://fantasy_api:{quote(password, safe='')}@localhost:{port}/fantasy_app"
    )
    if configured_url and configured_url != default_url:
        return

    # Existing PostgreSQL volumes never rerun docker-entrypoint-initdb.d scripts.
    # Provision missing objects, preserving existing passwords and database contents.
    literal = "'" + password.replace("'", "''") + "'"
    sql = (
        "SET standard_conforming_strings = on;\n"
        "SELECT 'CREATE ROLE fantasy_api LOGIN PASSWORD ' || quote_literal("
        + literal
        + ") WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fantasy_api') \\gexec\n"
        "SELECT 'CREATE DATABASE fantasy_app OWNER fantasy_api' "
        "WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='fantasy_app') \\gexec\n"
        "REVOKE ALL ON DATABASE fantasy_app FROM PUBLIC;\n"
        "GRANT CONNECT ON DATABASE fantasy_app TO fantasy_api;\n"
    )
    command = [
        "docker",
        "compose",
        "--env-file",
        str(root_path),
        "exec",
        "-T",
        "postgres",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "--username",
        shared.get("POSTGRES_USER", "fantasy"),
        "--dbname",
        shared.get("POSTGRES_DB", "fantasy_auth"),
    ]
    try:
        subprocess.run(command, cwd=root, input=sql, capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(
            "Could not prepare fantasy_app. Start PostgreSQL with "
            "'docker compose up -d postgres redis', then retry. "
            "Custom databases must be provisioned as documented in docs/api/scouting/README.md."
        ) from exc
    if not configured_url:
        _append(api_path, "SCOUTING_DATABASE_URL", default_url)
    if not shared.get("APP_DB_PASSWORD"):
        _append(root_path, "APP_DB_PASSWORD", password)


def main() -> int:
    """Prepare local development without exposing credentials in failure output."""
    try:
        prepare()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print("Local scouting configuration and application database are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
