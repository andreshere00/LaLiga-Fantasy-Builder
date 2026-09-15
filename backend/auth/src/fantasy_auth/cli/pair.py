"""One-command LaLiga pairing: create pairing + run PKCE helper."""

from __future__ import annotations

import argparse
import os
import sys

import httpx

from fantasy_auth.cli import helper as laliga_helper


def main(argv: list[str] | None = None) -> int:
    """Create a pairing with the BFF and run the interactive PKCE helper.

    Automates curl + env var plumbing. The LaLiga browser login remains
    interactive (B2C / social SSO cannot be completed without user consent).

    Environment (optional if flags are set):
        FANTASY_SESSION / fantasy_session cookie value
        FANTASY_CSRF / CSRF token (header + cookie)

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
        default=os.environ.get("FANTASY_API_BASE", "http://localhost:8000"),
        help="BFF base URL",
    )
    parser.add_argument(
        "--session",
        default=os.environ.get("FANTASY_SESSION") or os.environ.get("SESSION"),
        help="fantasy_session cookie (or env FANTASY_SESSION / SESSION)",
    )
    parser.add_argument(
        "--csrf",
        default=os.environ.get("FANTASY_CSRF") or os.environ.get("CSRF"),
        help="CSRF token (or env FANTASY_CSRF / CSRF)",
    )
    parser.add_argument(
        "--origin",
        default=os.environ.get("FANTASY_ORIGIN", "http://localhost:8000"),
        help="Origin header for CSRF checks",
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

    session = _normalize_cookie(args.session)
    csrf = _normalize_cookie(args.csrf)

    if not session or not csrf:
        print(
            "Missing session cookies. Export them first:\n"
            "  export FANTASY_SESSION='…'   # fantasy_session cookie\n"
            "  export FANTASY_CSRF='…'      # fantasy_csrf cookie / /auth/me csrf\n"
            "Then re-run: uv run pair-laliga",
            file=sys.stderr,
        )
        return 1

    pairing = _create_pairing(
        api_base=args.api_base,
        session=session,
        csrf=csrf,
        origin=args.origin,
    )
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
    session: str,
    csrf: str,
    origin: str,
) -> dict[str, str] | None:
    """POST /laliga/pairings with session cookies.

    Args:
        api_base: BFF origin.
        session: Opaque session cookie.
        csrf: CSRF token.
        origin: Browser origin header.

    Returns:
        Pairing JSON fields, or None on failure.
    """
    url = f"{api_base.rstrip('/')}/laliga/pairings"
    cookies = {"fantasy_session": session, "fantasy_csrf": csrf}
    headers = {"Origin": origin, "X-CSRF-Token": csrf}
    with httpx.Client(timeout=30.0) as client:
        response = client.post(url, headers=headers, cookies=cookies)
    if response.status_code == 401:
        print(
            "Unauthorized — session expired or CSRF mismatch. "
            "Re-login at /auth/login and copy fresh cookies.",
            file=sys.stderr,
        )
        return None
    if not response.is_success:
        print(
            f"Create pairing failed: {response.status_code} {response.text}",
            file=sys.stderr,
        )
        return None
    body = response.json()
    required = ("pairing_id", "secret", "nonce", "expires_at")
    if any(k not in body for k in required):
        print(f"Unexpected pairing response: {body}", file=sys.stderr)
        return None
    return {
        "pairing_id": str(body["pairing_id"]),
        "secret": str(body["secret"]),
        "nonce": str(body["nonce"]),
        "expires_at": str(body["expires_at"]),
    }


if __name__ == "__main__":
    raise SystemExit(main())
