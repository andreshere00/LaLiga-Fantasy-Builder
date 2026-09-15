"""Local LaLiga PKCE helper CLI."""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from fantasy_auth.adapters.b2c_httpx import HttpxB2CClient
from fantasy_auth.adapters.pkce import generate_state, generate_verifier, s256_challenge
from fantasy_auth.config import get_settings


def main(argv: list[str] | None = None) -> int:
    """Run the local Authorization Code + PKCE helper.

    Opens B2C authorize, reads the callback from clipboard/file/stdin,
    exchanges the code locally, and POSTs tokens to the BFF complete endpoint.

    Args:
        argv: Optional CLI arguments.

    Returns:
        Process exit code.
    """
    parser = argparse.ArgumentParser(
        description=(
            "LaLiga Fantasy Builder — local PKCE pairing helper for " "LaLiga B2C authorization"
        ),
    )
    parser.add_argument("--pairing", required=True, help="Pairing ID from the BFF")
    parser.add_argument("--secret", required=True, help="Pairing secret from the BFF")
    parser.add_argument(
        "--nonce",
        default=None,
        help="Nonce from create_pairing (required for JWT nonce check)",
    )
    parser.add_argument(
        "--api-base",
        default="http://localhost:8000",
        help="BFF base URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--redirect-uri",
        default=None,
        help="Override LaLiga redirect URI",
    )
    parser.add_argument(
        "--callback-file",
        default=None,
        help="Read the full authredirect:// URL from this file (avoids paste limits)",
    )
    parser.add_argument(
        "--clipboard",
        action="store_true",
        help="Read callback URL from the macOS clipboard (pbpaste) after Enter",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    redirect_uri = args.redirect_uri or settings.laliga_redirect_uri
    verifier = generate_verifier()
    challenge = s256_challenge(verifier)
    state = generate_state()
    nonce = args.nonce or state

    b2c = HttpxB2CClient(
        client_id=settings.laliga_client_id,
        signin_policy=settings.laliga_signin_policy,
        token_base_url=settings.laliga_base_url,
        authorize_url=settings.laliga_authorize_url,
        allow_id_token_fallback=settings.laliga_allow_id_token_fallback,
    )
    authorize_url = b2c.build_authorize_url(
        redirect_uri=redirect_uri,
        code_challenge=challenge,
        state=state,
        nonce=nonce,
    )

    print("Open this URL in a browser and sign in:", file=sys.stderr)
    print(authorize_url, file=sys.stderr)
    print(f"\nExpected state (must match callback): {state}", file=sys.stderr)
    try:
        webbrowser.open(authorize_url)
    except Exception:
        pass

    callback = _read_callback(args, redirect_uri=redirect_uri)
    if not callback:
        print("No callback URL provided", file=sys.stderr)
        return 1

    # Allow accidental Google-search wrappers: extract authredirect://… if present.
    callback = _extract_authredirect(callback, redirect_uri=redirect_uri)

    parsed = _parse_callback(callback, expected_state=state)
    if parsed.get("error"):
        print(f"B2C error: {parsed['error']}", file=sys.stderr)
        return 1
    code = parsed.get("code")
    if not code:
        print("Callback missing code", file=sys.stderr)
        return 1

    try:
        bundle = asyncio.run(
            b2c.exchange_code(
                code=code,
                code_verifier=verifier,
                redirect_uri=redirect_uri,
            )
        )
    except Exception as exc:
        print(f"Token exchange failed: {exc}", file=sys.stderr)
        return 1

    token_response = {
        "access_token": bundle.access_token,
        "id_token": bundle.id_token,
        "refresh_token": bundle.refresh_token,
        "token_type": bundle.token_type,
        "expires_in": bundle.expires_in,
        "expires_on": bundle.expires_on,
        "client_id": bundle.client_id,
        "policy": bundle.policy,
        "scope": bundle.scope,
        "id_token_expires_in": bundle.id_token_expires_in,
        "refresh_token_expires_in": bundle.refresh_token_expires_in,
    }

    complete_url = f"{args.api_base.rstrip('/')}/laliga/pairings/{args.pairing}/complete"
    payload = {"secret": args.secret, "token_response": token_response}
    with httpx.Client(timeout=30.0) as client:
        response = client.post(complete_url, json=payload)
    if not response.is_success:
        print(
            f"Complete failed: {response.status_code} {response.text}",
            file=sys.stderr,
        )
        return 1

    print(json.dumps(response.json(), indent=2))
    return 0


def _read_callback(args: argparse.Namespace, *, redirect_uri: str) -> str:
    """Load callback URL from file, clipboard, or stdin.

    Args:
        args: Parsed CLI args.
        redirect_uri: Expected redirect scheme/URI prefix.

    Returns:
        Callback string (may be empty).
    """
    if args.callback_file:
        path = Path(args.callback_file)
        print(
            f"\n1) Open the authorize URL above and sign in to LaLiga\n"
            f"2) Copy the full callback URL (starts with {redirect_uri})\n"
            f"3) Save it into {path} (overwrite the file, one line)\n"
            f"4) Press Enter here",
            file=sys.stderr,
        )
        sys.stdin.readline()
        return path.read_text(encoding="utf-8").strip()

    if args.clipboard:
        print(
            f"\n1) Open the authorize URL above and sign in to LaLiga\n"
            f"2) Copy the full callback URL (starts with {redirect_uri})\n"
            f"3) Press Enter here to read the macOS clipboard",
            file=sys.stderr,
        )
        sys.stdin.readline()
        return _pbpaste().strip()

    print(
        f"\nPrefer --clipboard or --callback-file for long URLs.\n"
        f"Or paste the full callback URL (starts with {redirect_uri}) and Enter:",
        file=sys.stderr,
    )
    return sys.stdin.readline().strip()


def _pbpaste() -> str:
    """Read the macOS clipboard via pbpaste.

    Returns:
        Clipboard text.

    Raises:
        RuntimeError: If pbpaste fails.
    """
    try:
        result = subprocess.run(
            ["pbpaste"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(f"pbpaste failed: {exc}") from exc
    return result.stdout


def _extract_authredirect(raw: str, *, redirect_uri: str) -> str:
    """Pull an authredirect URL out of a pasted blob / Google wrapper.

    Args:
        raw: User-provided paste.
        redirect_uri: Expected redirect prefix.

    Returns:
        Cleaned callback URL when found, otherwise the original string.
    """
    marker = redirect_uri if redirect_uri in raw else "authredirect://"
    idx = raw.find(marker)
    if idx < 0:
        return raw.strip()
    chunk = raw[idx:].strip()
    # Stop at whitespace/quotes if the paste included extra junk.
    for sep in (" ", "\t", "\n", "\r", '"', "'", "<", ">"):
        if sep in chunk:
            chunk = chunk.split(sep, 1)[0]
    return chunk


def _parse_callback(callback: str, *, expected_state: str) -> dict[str, Any]:
    """Extract code/state from a callback URL or query string.

    Args:
        callback: Full redirect URL or query fragment.
        expected_state: State that must match.

    Returns:
        Dict with code/error keys.
    """
    if "://" not in callback and callback.startswith("?"):
        query = callback[1:]
    elif "://" in callback:
        parsed = urlparse(callback)
        query = parsed.query
        # authredirect://host/?query  sometimes puts params in path; handle both.
        if not query and parsed.path.startswith("/"):
            # e.g. path "/?state=…&code=…" is unusual; prefer query.
            pass
        if not query and "?" in callback:
            query = callback.split("?", 1)[1]
    else:
        query = callback
    params = {k: v[0] for k, v in parse_qs(query).items()}
    if params.get("state") != expected_state:
        return {"error": "state mismatch"}
    return params


if __name__ == "__main__":
    raise SystemExit(main())
