"""One-command LaLiga pairing: create pairing + run PKCE helper."""

from __future__ import annotations

import argparse
import os
import sys

import httpx
from pydantic import ValidationError

from fantasy_auth.api.schemas import PairingCreateResponse
from fantasy_auth.cli import helper as laliga_helper


def main(argv: list[str] | None = None) -> int:
    """Create a pairing with the BFF and run the interactive PKCE helper.

    Automates curl + env var plumbing. The LaLiga browser login remains
    interactive (B2C / social SSO cannot be completed without user consent).

    Args:
        argv: Optional CLI arguments.

    Returns:
        Process exit code.
    """
    parser = argparse.ArgumentParser(
        description=(
            "LaLiga Fantasy Builder — create pairing and complete LaLiga PKCE " "in one command"
        ),
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("FANTASY_API_BASE", "http://localhost:3000"),
        help="BFF base URL",
    )
    parser.add_argument(
        "--jwt", default=os.environ.get("INTERNAL_JWT"), help="Better Auth application JWT"
    )
    callback = parser.add_mutually_exclusive_group()
    callback.add_argument(
        "--clipboard",
        action="store_true",
        help="Read authredirect URL from macOS clipboard after Enter (default)",
    )
    callback.add_argument(
        "--callback-file",
        default=None,
        help="Read authredirect URL from this file after Enter",
    )
    callback.add_argument(
        "--stdin",
        action="store_true",
        help="Paste authredirect URL into the terminal",
    )
    args = parser.parse_args(argv)

    jwt = _normalize_cookie(args.jwt)
    if not jwt:
        print(
            "Provide --jwt / INTERNAL_JWT from fantasy-browser-session --exports.", file=sys.stderr
        )
        return 1
    pairing = _create_pairing(api_base=args.api_base, jwt=jwt)
    if pairing is None:
        return 1

    print(
        f"Pairing created: {pairing['pairing_id']} " f"(expires_at={pairing['expires_at']})",
        file=sys.stderr,
    )

    helper_argv = [
        "--pairing",
        pairing["pairing_id"],
        "--secret",
        pairing["secret"],
        "--nonce",
        pairing["nonce"],
        "--api-base",
        args.api_base,
    ]
    if args.callback_file:
        helper_argv.extend(["--callback-file", args.callback_file])
    elif args.stdin:
        pass
    else:
        helper_argv.append("--clipboard")

    return laliga_helper.main(helper_argv)


def _normalize_cookie(value: str | None) -> str:
    """Strip whitespace and accidental line breaks from cookie values."""
    if not value:
        return ""
    return value.replace("\r", "").replace("\n", "").strip()


def _create_pairing(
    *,
    api_base: str,
    jwt: str,
) -> dict[str, str] | None:
    """Create a challenge for the verified Better Auth subject."""
    url = f"{api_base.rstrip('/')}/laliga/pairings"
    with httpx.Client(timeout=30.0) as client:
        response = client.post(url, headers={"Authorization": f"Bearer {jwt}"})
    if response.status_code == 401:
        print("Session expired. Run fantasy-browser-session again.", file=sys.stderr)
        return None
    if not response.is_success:
        print(f"Create pairing failed: HTTP {response.status_code}", file=sys.stderr)
        return None
    try:
        body = PairingCreateResponse.model_validate(response.json())
    except (ValueError, ValidationError):
        print("Unexpected pairing response shape", file=sys.stderr)
        return None
    return {
        "pairing_id": body.pairing_id,
        "secret": body.secret,
        "nonce": body.nonce,
        "expires_at": str(body.expires_at),
    }


if __name__ == "__main__":
    raise SystemExit(main())
