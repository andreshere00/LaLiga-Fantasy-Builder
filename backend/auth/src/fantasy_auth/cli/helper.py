"""Local LaLiga PKCE helper CLI."""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
import tempfile
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from fantasy_auth.adapters.b2c_httpx import HttpxB2CClient
from fantasy_auth.adapters.pkce import generate_state, generate_verifier, s256_challenge
from fantasy_auth.config import get_settings


class PairingHelperError(RuntimeError):
    """PKCE callback, token exchange, or pairing complete failed."""


@dataclass
class PkceAuthorizeSession:
    """PKCE verifier/state plus the B2C authorize URL."""

    authorize_url: str
    verifier: str
    state: str
    nonce: str
    redirect_uri: str
    b2c: HttpxB2CClient


def start_pkce_session(
    *,
    nonce: str | None = None,
    redirect_uri: str | None = None,
) -> PkceAuthorizeSession:
    """Build a PKCE authorize URL for LaLiga B2C.

    Args:
        nonce: Pairing nonce from the BFF (defaults to a fresh state).
        redirect_uri: Override for the native redirect URI.

    Returns:
        Authorize URL and secrets needed to complete the code exchange.
    """
    settings = get_settings()
    resolved_redirect = redirect_uri or settings.laliga_redirect_uri
    verifier = generate_verifier()
    challenge = s256_challenge(verifier)
    state = generate_state()
    used_nonce = nonce or state
    b2c = HttpxB2CClient(
        client_id=settings.laliga_client_id,
        signin_policy=settings.laliga_signin_policy,
        token_base_url=settings.laliga_base_url,
        authorize_url=settings.laliga_authorize_url,
        allow_id_token_fallback=settings.laliga_allow_id_token_fallback,
    )
    authorize_url = b2c.build_authorize_url(
        redirect_uri=resolved_redirect,
        code_challenge=challenge,
        state=state,
        nonce=used_nonce,
    )
    return PkceAuthorizeSession(
        authorize_url=authorize_url,
        verifier=verifier,
        state=state,
        nonce=used_nonce,
        redirect_uri=resolved_redirect,
        b2c=b2c,
    )


def pick_complete_callback(candidate: str, *, redirect_uri: str) -> str | None:
    """Return a cleaned authredirect URL when it looks complete.

    Args:
        candidate: Raw navigation or request URL.
        redirect_uri: Expected native redirect prefix.

    Returns:
        Clean callback URL, or None when the candidate is not complete.
    """
    if not candidate:
        return None
    cleaned = _extract_authredirect(candidate, redirect_uri=redirect_uri)
    if _callback_looks_complete(cleaned, redirect_uri=redirect_uri):
        return cleaned
    return None


def complete_pairing_from_callback(
    *,
    callback: str,
    pairing_id: str,
    secret: str,
    expected_state: str,
    verifier: str,
    redirect_uri: str,
    api_base: str,
    b2c: HttpxB2CClient,
) -> dict[str, Any]:
    """Exchange the B2C code and POST pairing complete.

    Args:
        callback: Full ``authredirect://`` URL from B2C.
        pairing_id: Pairing id from POST /laliga/pairings.
        secret: One-time pairing secret.
        expected_state: PKCE state that must match the callback.
        verifier: PKCE code_verifier used to build the authorize URL.
        redirect_uri: Native redirect URI used at authorize time.
        api_base: Auth service origin.
        b2c: B2C client used for the token exchange.

    Returns:
        JSON body from POST /laliga/pairings/{id}/complete.

    Raises:
        PairingHelperError: When the callback, exchange, or complete fails.
    """
    callback = _extract_authredirect(callback, redirect_uri=redirect_uri)
    if not _callback_looks_complete(callback, redirect_uri=redirect_uri):
        raise PairingHelperError(
            "Callback URL looks incomplete (truncated paste?). "
            "Use --callback-file and save the URL with: "
            "pbpaste > /tmp/laliga-callback.txt",
        )
    parsed = _parse_callback(callback, expected_state=expected_state)
    if parsed.get("error"):
        raise PairingHelperError(f"B2C error: {parsed['error']}")
    code = parsed.get("code")
    if not code:
        raise PairingHelperError("Callback missing code")

    print("Exchanging authorization code with LaLiga...", file=sys.stderr)
    try:
        bundle = asyncio.run(
            b2c.exchange_code(
                code=code,
                code_verifier=verifier,
                redirect_uri=redirect_uri,
            )
        )
    except Exception as exc:
        raise PairingHelperError(f"Token exchange failed: {exc}") from exc

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
    complete_url = f"{api_base.rstrip('/')}/laliga/pairings/{pairing_id}/complete"
    payload = {"secret": secret, "token_response": token_response}
    print("Completing pairing with auth service...", file=sys.stderr)
    with httpx.Client(timeout=30.0) as client:
        response = client.post(complete_url, json=payload)
    if not response.is_success:
        raise PairingHelperError(
            f"Complete failed: {response.status_code} {response.text}",
        )
    body = response.json()
    if not isinstance(body, dict):
        raise PairingHelperError("Complete returned a non-object JSON body")
    return body


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

    pkce = start_pkce_session(nonce=args.nonce, redirect_uri=args.redirect_uri)

    print("Open this URL in a browser and sign in:", file=sys.stderr)
    print(pkce.authorize_url, file=sys.stderr)
    print(
        f"\nExpected state (must match callback): {pkce.state}",
        file=sys.stderr,
    )
    try:
        webbrowser.open(pkce.authorize_url)
    except webbrowser.Error:
        pass

    callback = _read_callback(args, redirect_uri=pkce.redirect_uri)
    if not callback:
        print("No callback URL provided", file=sys.stderr)
        return 1

    try:
        result = complete_pairing_from_callback(
            callback=callback,
            pairing_id=args.pairing,
            secret=args.secret,
            expected_state=pkce.state,
            verifier=pkce.verifier,
            redirect_uri=pkce.redirect_uri,
            api_base=args.api_base,
            b2c=pkce.b2c,
        )
    except PairingHelperError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2))
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
        return _read_callback_from_clipboard(redirect_uri=redirect_uri)

    print(
        f"\nPrefer --clipboard or --callback-file for long URLs.\n"
        f"Or paste the full callback URL (starts with {redirect_uri}) and Enter:",
        file=sys.stderr,
    )
    return sys.stdin.readline().strip()


DEFAULT_CALLBACK_FILE = Path(tempfile.gettempdir()) / "laliga-callback.txt"


def _read_callback_from_clipboard(*, redirect_uri: str) -> str:
    """Read the callback from macOS clipboard after the user confirms copy."""
    fallback_file = DEFAULT_CALLBACK_FILE
    print(
        f"\n1) Open the authorize URL above and sign in to LaLiga\n"
        f"2) Copy the full callback URL (starts with {redirect_uri})\n"
        f"3) Press Enter here when copied — do NOT paste into this terminal\n"
        f"   Fallback: pbpaste > {fallback_file} then press Enter",
        file=sys.stderr,
    )
    sys.stdin.readline()
    callback = _pbpaste().strip()
    if _looks_like_callback(callback, redirect_uri=redirect_uri):
        print(f"Callback captured from clipboard ({len(callback)} chars)", file=sys.stderr)
        return callback

    if fallback_file.is_file():
        callback = fallback_file.read_text(encoding="utf-8").strip()
        if _looks_like_callback(callback, redirect_uri=redirect_uri):
            print(
                f"Callback captured from {fallback_file} ({len(callback)} chars)",
                file=sys.stderr,
            )
            return callback

    print(
        "Could not read a callback from the clipboard or fallback file.\n"
        "Paste the URL below, then press Enter:",
        file=sys.stderr,
    )
    return _read_terminal_callback(redirect_uri=redirect_uri)


def _read_terminal_callback(*, redirect_uri: str) -> str:
    """Read a callback URL pasted into the terminal (single or wrapped lines)."""
    lines: list[str] = []
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        if line == "\n" and lines:
            break
        lines.append(line.rstrip("\n"))
        combined = "".join(lines).strip()
        if _callback_looks_complete(combined, redirect_uri=redirect_uri):
            print(f"Callback captured from terminal ({len(combined)} chars)", file=sys.stderr)
            return combined
    return "".join(lines).strip()


def _callback_looks_complete(value: str, *, redirect_uri: str) -> bool:
    """Return whether a callback URL likely contains a full authorization code."""
    if not _looks_like_callback(value, redirect_uri=redirect_uri):
        return False
    cleaned = _extract_authredirect(value, redirect_uri=redirect_uri)
    query = cleaned.split("?", 1)[-1] if "?" in cleaned else cleaned
    params = {k: v[0] for k, v in parse_qs(query).items()}
    if params.get("error"):
        return True
    code = params.get("code", "")
    return len(code) >= 100


def _looks_like_callback(value: str, *, redirect_uri: str) -> bool:
    """Return whether text appears to contain a LaLiga authredirect callback."""
    stripped = value.strip()
    return bool(stripped) and (redirect_uri in stripped or "authredirect://" in stripped)


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
    duplicate_at = chunk.find(marker, len(marker))
    if duplicate_at > 0:
        chunk = chunk[:duplicate_at]
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
