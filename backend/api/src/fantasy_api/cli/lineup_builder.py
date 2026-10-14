"""Read-only lineup planning CLI with validation before authentication."""

import argparse
import json
import sys
from pathlib import Path

import httpx
from pydantic import ValidationError

from fantasy_api.cli.common import add_common_cli_args, api_build, path_segment, resolve_jwt
from fantasy_api.schemas.lineup_builder import BuildPreferences


def main(argv: list[str] | None = None) -> int:
    """Validate preferences, authenticate and print read-only build recommendations.

    Args:
        argv: Optional command-line arguments.

    Returns:
        Zero on success, nonzero on validation/authentication/build failure.
    """
    parser = argparse.ArgumentParser(description="Build read-only lineup recommendations")
    add_common_cli_args(parser)
    parser.add_argument("--league-id", required=True)
    parser.add_argument("--preferences-file", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        preferences = BuildPreferences.model_validate(
            json.loads(args.preferences_file.read_text()) if args.preferences_file else {}
        )
        if not args.league_id.strip() or args.league_id in {"YOUR_LEAGUE", "<league-id>", "ID"}:
            raise ValueError("a real league id is required")
    except (OSError, ValueError, ValidationError):
        print("Invalid league or preferences file", file=sys.stderr)
        return 2
    jwt = resolve_jwt(args, command="fantasy-lineup-builder")
    if not jwt:
        return 1
    try:
        result = api_build(
            args.api_base,
            f"/lineup-builder/leagues/{path_segment(args.league_id)}/build",
            jwt,
            preferences.model_dump(mode="json"),
        )
    except (RuntimeError, httpx.HTTPError):
        print("Lineup build failed; check API diagnostics and source availability", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"Round {result['target']['week']}: {len(result['candidates'])} candidates")
    return 0
