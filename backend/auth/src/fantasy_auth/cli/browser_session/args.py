"""CLI argument parsing for fantasy-browser-session."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from fantasy_auth.cli.browser_session.errors import BrowserSessionError

DEFAULT_AUTH_BASE = "http://localhost:8000"
DEFAULT_API_BASE = "http://localhost:8001"
DEFAULT_ORIGIN = "http://localhost:8000"
DEFAULT_USERNAME = "demo"
DEFAULT_PASSWORD = "demo"

_PLACEHOLDER_TEAM_IDS = {"YOUR_TEAM", "your_team", "<team-id>", "ID"}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments.

    Args:
        argv: Optional CLI arguments.

    Returns:
        Parsed namespace.
    """
    parser = argparse.ArgumentParser(
        description=(
            "Log in to local Keycloak with Playwright, mint an internal JWT, "
            "pair LaLiga if needed, and run optional API analysis flows."
        ),
    )
    parser.add_argument(
        "--auth-base",
        default=os.environ.get("FANTASY_AUTH_BASE", DEFAULT_AUTH_BASE),
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("FANTASY_API_BASE", DEFAULT_API_BASE),
    )
    parser.add_argument(
        "--origin",
        default=os.environ.get("FANTASY_ORIGIN", DEFAULT_ORIGIN),
    )
    parser.add_argument(
        "--username",
        default=os.environ.get("KEYCLOAK_USERNAME", DEFAULT_USERNAME),
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("KEYCLOAK_PASSWORD", DEFAULT_PASSWORD),
    )
    parser.add_argument("--player-id", default=None)
    parser.add_argument("--league-id", default=None)
    parser.add_argument(
        "--headless",
        action="store_true",
        help=("Run Keycloak Chromium without a window " "(LaLiga pairing still opens a window)"),
    )
    parser.add_argument(
        "--no-pair",
        action="store_true",
        help="Do not start LaLiga pairing when the vault is empty",
    )
    parser.add_argument(
        "--exports",
        action="store_true",
        help="Print FANTASY_SESSION / FANTASY_CSRF / INTERNAL_JWT exports",
    )
    parser.add_argument(
        "--print-jwt",
        action="store_true",
        help="Include access_token in --json output",
    )
    parser.add_argument("--json", action="store_true")
    parser.set_defaults(
        flow=None,
        week=None,
        activity_page=0,
        team_id=None,
        put_lineup=None,
    )
    subparsers = parser.add_subparsers(dest="flow")
    leagues = subparsers.add_parser(
        "leagues-analysis",
        help="GET leagues, standing, activity, and squads",
    )
    _add_analysis_args(leagues, include_activity=True)
    teams = subparsers.add_parser(
        "teams-analysis",
        help="GET team money/lineup and optionally PUT lineup",
    )
    _add_analysis_args(teams, include_activity=False)
    teams.add_argument(
        "--put-lineup",
        default=None,
        help="JSON file for PUT /teams/{id}/lineup (requires --team-id)",
    )
    return parser.parse_args(argv)


def validate_analysis_args(args: argparse.Namespace) -> None:
    """Reject analysis flags that would fail after pairing.

    Args:
        args: Parsed CLI namespace.

    Raises:
        BrowserSessionError: When PUT flags are incomplete or invalid.
    """
    team_id = args.team_id
    if team_id in _PLACEHOLDER_TEAM_IDS:
        raise BrowserSessionError(
            "--team-id looks like a placeholder. Omit it to use the team "
            "from GET /leagues, or pass your real Fantasy team id.",
        )
    if not args.put_lineup:
        return
    if not team_id:
        raise BrowserSessionError(
            "--put-lineup requires --team-id and a JSON file that exists. "
            "For a read-only report, omit --put-lineup.",
        )
    load_put_lineup(args.put_lineup)


def load_put_lineup(path: str | None) -> dict[str, Any] | None:
    """Load an optional lineup JSON file for PUT /teams/{id}/lineup.

    Args:
        path: Filesystem path, or None when PUT is not requested.

    Returns:
        Lineup JSON object, or None.

    Raises:
        BrowserSessionError: When the file is missing or not a JSON object.
    """
    if not path:
        return None
    file_path = Path(path)
    if not file_path.is_file():
        raise BrowserSessionError(
            f"Cannot read --put-lineup: {file_path} does not exist. "
            "Omit --put-lineup for money/lineup GETs, or pass a JSON object "
            "file with a full lineup body.",
        )
    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise BrowserSessionError(f"Cannot read --put-lineup: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise BrowserSessionError(f"Invalid --put-lineup JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise BrowserSessionError("--put-lineup must be a JSON object")
    return payload


def needs_laliga(args: argparse.Namespace) -> bool:
    """Return whether this invocation requires a linked LaLiga vault."""
    return bool(args.player_id or args.flow)


def _positive_week(value: str) -> int:
    """Parse a matchweek number (must be >= 1)."""
    week = int(value)
    if week < 1:
        raise argparse.ArgumentTypeError("week must be >= 1")
    return week


def _add_analysis_args(
    parser: argparse.ArgumentParser,
    *,
    include_activity: bool,
) -> None:
    """Register flags shared by analysis subcommands."""
    parser.add_argument("--league-id", default=None)
    parser.add_argument(
        "--week",
        type=_positive_week,
        default=None,
        help="Matchweek (>= 1). Default: infer from /leagues",
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--team-id",
        default=None,
        help="Team id for squad/money/lineup (default: from /leagues)",
    )
    if include_activity:
        parser.add_argument(
            "--activity-page",
            type=int,
            default=0,
            help="Activity page index (default: 0)",
        )
