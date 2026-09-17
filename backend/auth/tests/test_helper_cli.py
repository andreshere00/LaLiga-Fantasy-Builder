# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from fantasy_auth.cli import helper
from fantasy_auth.domain.tokens import TokenBundle

REDIRECT = "authredirect://com.lfp.laligafantasy"
STATE = "expected-state"
LONG_CODE = "x" * 120


def _ns(**overrides: Any) -> argparse.Namespace:
    defaults: dict[str, Any] = {
        "callback_file": None,
        "clipboard": False,
    }
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


# ---- Happy path ---- #


def test_extract_authredirect_clean_url_returns_as_is() -> None:
    # Arrange
    raw = f"{REDIRECT}/?state=s&code=c"

    # Act
    result = helper._extract_authredirect(raw, redirect_uri=REDIRECT)

    # Assert
    assert result == raw


def test_extract_authredirect_google_wrapper_extracts_url() -> None:
    # Arrange
    wrapped = 'https://www.google.com/search?q="' f'{REDIRECT}/?state=abc&code=xyz" extra'

    # Act
    result = helper._extract_authredirect(wrapped, redirect_uri=REDIRECT)

    # Assert
    assert result.startswith(REDIRECT)
    assert "state=abc" in result
    assert "code=xyz" in result
    assert '"' not in result


def test_parse_callback_full_url_returns_params() -> None:
    # Arrange
    callback = f"{REDIRECT}/?state={STATE}&code=the-code"

    # Act
    result = helper._parse_callback(callback, expected_state=STATE)

    # Assert
    assert result["code"] == "the-code"
    assert result["state"] == STATE


def test_parse_callback_query_only_returns_params() -> None:
    # Arrange
    callback = f"?state={STATE}&code=query-code"

    # Act
    result = helper._parse_callback(callback, expected_state=STATE)

    # Assert
    assert result["code"] == "query-code"


def test_pbpaste_subprocess_success_returns_stdout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        helper.subprocess,
        "run",
        lambda *_a, **_k: SimpleNamespace(stdout="clip-url\n"),
    )

    # Act
    result = helper._pbpaste()

    # Assert
    assert result == "clip-url\n"


def test_read_callback_via_callback_file_returns_content(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    path = tmp_path / "cb.txt"
    path.write_text(f"{REDIRECT}/?code=1&state=s\n", encoding="utf-8")
    monkeypatch.setattr(helper.sys.stdin, "readline", lambda: "\n")
    args = _ns(callback_file=str(path))

    # Act
    result = helper._read_callback(args, redirect_uri=REDIRECT)

    # Assert
    assert result.startswith(REDIRECT)


def test_read_callback_via_clipboard_uses_pbpaste(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(helper.sys.stdin, "readline", lambda: "\n")
    monkeypatch.setattr(
        helper,
        "_pbpaste",
        lambda: f" {REDIRECT}/?state=s&code={'x' * 120} ",
    )
    args = _ns(clipboard=True)

    # Act
    result = helper._read_callback(args, redirect_uri=REDIRECT)

    # Assert
    assert result.startswith(REDIRECT)
    assert len(result) > 100


def test_read_callback_clipboard_falls_back_to_terminal(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    monkeypatch.setattr(helper, "DEFAULT_CALLBACK_FILE", tmp_path / "missing.txt")
    monkeypatch.setattr(helper, "_pbpaste", lambda: "not-a-callback")
    lines = iter(
        [
            "\n",
            f"{REDIRECT}/?state=s&code={LONG_CODE}\n",
        ]
    )
    monkeypatch.setattr(helper.sys.stdin, "readline", lambda: next(lines))
    args = _ns(clipboard=True)

    # Act
    result = helper._read_callback(args, redirect_uri=REDIRECT)

    # Assert
    assert LONG_CODE in result


def test_read_terminal_callback_joins_wrapped_lines(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    callback = f"{REDIRECT}/?state=s&code={LONG_CODE}"
    chunks = iter([callback[:50] + "\n", callback[50:] + "\n"])
    monkeypatch.setattr(helper.sys.stdin, "readline", lambda: next(chunks, ""))

    # Act
    result = helper._read_terminal_callback(redirect_uri=REDIRECT)

    # Assert
    assert result == callback


def test_read_terminal_callback_blank_line_stops(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    lines = iter(["partial\n", "\n"])
    monkeypatch.setattr(helper.sys.stdin, "readline", lambda: next(lines, ""))

    # Act
    result = helper._read_terminal_callback(redirect_uri=REDIRECT)

    # Assert
    assert result == "partial"


def test_read_callback_via_clipboard_falls_back_to_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Arrange
    fallback = tmp_path / "laliga-callback.txt"
    callback = f"{REDIRECT}/?state=s&code={'y' * 120}"
    fallback.write_text(callback, encoding="utf-8")
    monkeypatch.setattr(helper, "DEFAULT_CALLBACK_FILE", fallback)
    monkeypatch.setattr(helper.sys.stdin, "readline", lambda: "\n")
    monkeypatch.setattr(helper, "_pbpaste", lambda: "")
    args = _ns(clipboard=True)

    # Act
    result = helper._read_callback(args, redirect_uri=REDIRECT)

    # Assert
    assert result == callback


def test_pick_complete_callback_full_code_returns_cleaned() -> None:
    # Arrange
    raw = f"noise {REDIRECT}/?state=s&code={LONG_CODE} trailing"

    # Act
    result = helper.pick_complete_callback(raw, redirect_uri=REDIRECT)

    # Assert
    assert result is not None
    assert result.startswith(REDIRECT)
    assert LONG_CODE in result


def test_callback_looks_complete_rejects_short_code() -> None:
    # Arrange
    short = f"{REDIRECT}/?state=s&code=short"

    # Act
    result = helper._callback_looks_complete(short, redirect_uri=REDIRECT)

    # Assert
    assert result is False


def test_extract_authredirect_duplicate_url_keeps_first_only() -> None:
    # Arrange
    first = f"{REDIRECT}/?state=s&code=first-token"
    second = f"{REDIRECT}/?state=s&code=second-token"
    raw = first + second

    # Act
    result = helper._extract_authredirect(raw, redirect_uri=REDIRECT)

    # Assert
    assert result == first
    assert "second-token" not in result


def test_main_rejects_incomplete_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = SimpleNamespace(
        laliga_redirect_uri=REDIRECT,
        laliga_client_id="client",
        laliga_signin_policy="policy",
        laliga_base_url="https://login.example/token",
        laliga_authorize_url="https://login.example/authorize",
        laliga_allow_id_token_fallback=False,
    )
    monkeypatch.setattr(helper, "get_settings", lambda: settings)
    monkeypatch.setattr(helper, "generate_verifier", lambda: "v")
    monkeypatch.setattr(helper, "s256_challenge", lambda _v: "c")
    monkeypatch.setattr(helper, "generate_state", lambda: STATE)
    fake_b2c = MagicMock()
    fake_b2c.build_authorize_url.return_value = "https://auth.example"
    monkeypatch.setattr(helper, "HttpxB2CClient", lambda **_k: fake_b2c)
    monkeypatch.setattr(helper.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(
        helper,
        "_read_callback",
        lambda *_a, **_k: f"{REDIRECT}/?state={STATE}&code=short",
    )

    # Act
    code = helper.main(["--pairing", "p", "--secret", "s"])

    # Assert
    assert code == 1


def test_read_callback_via_stdin_returns_line(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        helper.sys.stdin,
        "readline",
        lambda: f"{REDIRECT}/?code=x&state=y\n",
    )
    args = _ns()

    # Act
    result = helper._read_callback(args, redirect_uri=REDIRECT)

    # Assert
    assert "code=x" in result


def test_main_happy_path_posts_complete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = SimpleNamespace(
        laliga_redirect_uri=REDIRECT,
        laliga_client_id="client",
        laliga_signin_policy="policy",
        laliga_base_url="https://login.example/token",
        laliga_authorize_url="https://login.example/authorize",
        laliga_allow_id_token_fallback=False,
    )
    monkeypatch.setattr(helper, "get_settings", lambda: settings)
    monkeypatch.setattr(helper, "generate_verifier", lambda: "verifier")
    monkeypatch.setattr(helper, "s256_challenge", lambda _v: "challenge")
    monkeypatch.setattr(helper, "generate_state", lambda: STATE)

    fake_b2c = MagicMock()
    fake_b2c.build_authorize_url.return_value = "https://auth.example/authorize"
    fake_b2c.exchange_code = MagicMock(
        return_value=TokenBundle(
            access_token="at",
            id_token="idt",
            refresh_token="rt",
            expires_on=1_700_000_000,
            client_id="client",
            policy="policy",
            scope="openid",
            expires_in=3600,
            id_token_expires_in=3600,
            refresh_token_expires_in=86_400,
        )
    )

    class FakeB2CCtor:
        def __init__(self, **_kwargs: Any) -> None:
            pass

        def __new__(cls, **_kwargs: Any) -> MagicMock:
            return fake_b2c

    monkeypatch.setattr(helper, "HttpxB2CClient", FakeB2CCtor)
    monkeypatch.setattr(helper.webbrowser, "open", lambda _url: True)
    monkeypatch.setattr(
        helper,
        "_read_callback",
        lambda _a, *, redirect_uri: f"{REDIRECT}/?state={STATE}&code={LONG_CODE}",
    )

    post_response = MagicMock()
    post_response.is_success = True
    post_response.json.return_value = {"ok": True, "manager_id": "mgr-1"}

    class FakeClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def __enter__(self) -> FakeClient:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def post(self, url: str, json: dict[str, Any]) -> MagicMock:
            assert "/laliga/pairings/pair-1/complete" in url
            assert json["secret"] == "sec-1"
            assert json["token_response"]["access_token"] == "at"
            return post_response

    monkeypatch.setattr(helper.httpx, "Client", FakeClient)

    async def _exchange(**kwargs: Any) -> TokenBundle:
        return await fake_b2c.exchange_code(**kwargs)

    # exchange_code is awaited via asyncio.run — provide a real coroutine
    async def exchange_coro(**_kwargs: Any) -> TokenBundle:
        return TokenBundle(
            access_token="at",
            id_token="idt",
            refresh_token="rt",
            expires_on=1_700_000_000,
            client_id="client",
            policy="policy",
            scope="openid",
            expires_in=3600,
            id_token_expires_in=3600,
            refresh_token_expires_in=86_400,
        )

    fake_b2c.exchange_code = exchange_coro

    # Act
    code = helper.main(
        [
            "--pairing",
            "pair-1",
            "--secret",
            "sec-1",
            "--api-base",
            "http://localhost:8000",
        ]
    )

    # Assert
    assert code == 0


# ---- Error paths ---- #


def test_extract_authredirect_no_marker_returns_stripped() -> None:
    # Arrange
    raw = "  https://example.com/callback?code=1  "

    # Act
    result = helper._extract_authredirect(raw, redirect_uri=REDIRECT)

    # Assert
    assert result == "https://example.com/callback?code=1"


def test_parse_callback_state_mismatch_returns_error() -> None:
    # Arrange
    callback = f"{REDIRECT}/?state=wrong&code=c"

    # Act
    result = helper._parse_callback(callback, expected_state=STATE)

    # Assert
    assert result == {"error": "state mismatch"}


def test_pbpaste_subprocess_failure_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    def boom(*_a: Any, **_k: Any) -> None:
        raise subprocess.CalledProcessError(1, "pbpaste")

    monkeypatch.setattr(helper.subprocess, "run", boom)

    # Act / Assert
    with pytest.raises(RuntimeError, match="pbpaste failed"):
        helper._pbpaste()


def test_main_empty_callback_returns_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = SimpleNamespace(
        laliga_redirect_uri=REDIRECT,
        laliga_client_id="client",
        laliga_signin_policy="policy",
        laliga_base_url="https://login.example/token",
        laliga_authorize_url="https://login.example/authorize",
        laliga_allow_id_token_fallback=False,
    )
    monkeypatch.setattr(helper, "get_settings", lambda: settings)
    monkeypatch.setattr(helper, "generate_verifier", lambda: "v")
    monkeypatch.setattr(helper, "s256_challenge", lambda _v: "c")
    monkeypatch.setattr(helper, "generate_state", lambda: STATE)
    fake_b2c = MagicMock()
    fake_b2c.build_authorize_url.return_value = "https://auth.example"
    monkeypatch.setattr(helper, "HttpxB2CClient", lambda **_k: fake_b2c)
    monkeypatch.setattr(helper.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(helper, "_read_callback", lambda *_a, **_k: "")

    # Act
    code = helper.main(["--pairing", "p", "--secret", "s"])

    # Assert
    assert code == 1


def test_main_b2c_error_returns_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = SimpleNamespace(
        laliga_redirect_uri=REDIRECT,
        laliga_client_id="client",
        laliga_signin_policy="policy",
        laliga_base_url="https://login.example/token",
        laliga_authorize_url="https://login.example/authorize",
        laliga_allow_id_token_fallback=False,
    )
    monkeypatch.setattr(helper, "get_settings", lambda: settings)
    monkeypatch.setattr(helper, "generate_verifier", lambda: "v")
    monkeypatch.setattr(helper, "s256_challenge", lambda _v: "c")
    monkeypatch.setattr(helper, "generate_state", lambda: STATE)
    fake_b2c = MagicMock()
    fake_b2c.build_authorize_url.return_value = "https://auth.example"
    monkeypatch.setattr(helper, "HttpxB2CClient", lambda **_k: fake_b2c)
    monkeypatch.setattr(helper.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(
        helper,
        "_read_callback",
        lambda *_a, **_k: f"{REDIRECT}/?state={STATE}&error=access_denied",
    )

    # Act
    code = helper.main(["--pairing", "p", "--secret", "s"])

    # Assert
    assert code == 1


def test_main_missing_code_returns_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = SimpleNamespace(
        laliga_redirect_uri=REDIRECT,
        laliga_client_id="client",
        laliga_signin_policy="policy",
        laliga_base_url="https://login.example/token",
        laliga_authorize_url="https://login.example/authorize",
        laliga_allow_id_token_fallback=False,
    )
    monkeypatch.setattr(helper, "get_settings", lambda: settings)
    monkeypatch.setattr(helper, "generate_verifier", lambda: "v")
    monkeypatch.setattr(helper, "s256_challenge", lambda _v: "c")
    monkeypatch.setattr(helper, "generate_state", lambda: STATE)
    fake_b2c = MagicMock()
    fake_b2c.build_authorize_url.return_value = "https://auth.example"
    monkeypatch.setattr(helper, "HttpxB2CClient", lambda **_k: fake_b2c)
    monkeypatch.setattr(helper.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(
        helper,
        "_read_callback",
        lambda *_a, **_k: f"{REDIRECT}/?state={STATE}",
    )

    # Act
    code = helper.main(["--pairing", "p", "--secret", "s"])

    # Assert
    assert code == 1


def test_main_exchange_fail_returns_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = SimpleNamespace(
        laliga_redirect_uri=REDIRECT,
        laliga_client_id="client",
        laliga_signin_policy="policy",
        laliga_base_url="https://login.example/token",
        laliga_authorize_url="https://login.example/authorize",
        laliga_allow_id_token_fallback=False,
    )
    monkeypatch.setattr(helper, "get_settings", lambda: settings)
    monkeypatch.setattr(helper, "generate_verifier", lambda: "v")
    monkeypatch.setattr(helper, "s256_challenge", lambda _v: "c")
    monkeypatch.setattr(helper, "generate_state", lambda: STATE)
    fake_b2c = MagicMock()
    fake_b2c.build_authorize_url.return_value = "https://auth.example"

    async def boom(**_k: Any) -> TokenBundle:
        raise RuntimeError("exchange down")

    fake_b2c.exchange_code = boom
    monkeypatch.setattr(helper, "HttpxB2CClient", lambda **_k: fake_b2c)
    monkeypatch.setattr(helper.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(
        helper,
        "_read_callback",
        lambda *_a, **_k: f"{REDIRECT}/?state={STATE}&code={LONG_CODE}",
    )

    # Act
    code = helper.main(["--pairing", "p", "--secret", "s"])

    # Assert
    assert code == 1


def test_main_complete_http_fail_returns_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    settings = SimpleNamespace(
        laliga_redirect_uri=REDIRECT,
        laliga_client_id="client",
        laliga_signin_policy="policy",
        laliga_base_url="https://login.example/token",
        laliga_authorize_url="https://login.example/authorize",
        laliga_allow_id_token_fallback=False,
    )
    monkeypatch.setattr(helper, "get_settings", lambda: settings)
    monkeypatch.setattr(helper, "generate_verifier", lambda: "v")
    monkeypatch.setattr(helper, "s256_challenge", lambda _v: "c")
    monkeypatch.setattr(helper, "generate_state", lambda: STATE)
    fake_b2c = MagicMock()
    fake_b2c.build_authorize_url.return_value = "https://auth.example"

    async def exchange(**_k: Any) -> TokenBundle:
        return TokenBundle(
            access_token="at",
            expires_on=1,
            client_id="c",
            policy="p",
            scope="openid",
        )

    fake_b2c.exchange_code = exchange
    monkeypatch.setattr(helper, "HttpxB2CClient", lambda **_k: fake_b2c)
    monkeypatch.setattr(helper.webbrowser, "open", lambda _u: None)
    monkeypatch.setattr(
        helper,
        "_read_callback",
        lambda *_a, **_k: f"{REDIRECT}/?state={STATE}&code={LONG_CODE}",
    )

    fail = MagicMock()
    fail.is_success = False
    fail.status_code = 500
    fail.text = "boom"

    class FakeClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def __enter__(self) -> FakeClient:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def post(self, *_a: Any, **_k: Any) -> MagicMock:
            return fail

    monkeypatch.setattr(helper.httpx, "Client", FakeClient)

    # Act
    code = helper.main(["--pairing", "p", "--secret", "s"])

    # Assert
    assert code == 1


# ---- Edge cases ---- #


def test_parse_callback_bare_query_string_without_question() -> None:
    # Arrange
    callback = f"state={STATE}&code=bare"

    # Act
    result = helper._parse_callback(callback, expected_state=STATE)

    # Assert
    assert result["code"] == "bare"


def test_pick_complete_callback_https_url_returns_none() -> None:
    # Arrange
    raw = "https://login.laliga.es/oauth2/v2.0/authorize?code=short"

    # Act
    result = helper.pick_complete_callback(raw, redirect_uri=REDIRECT)

    # Assert
    assert result is None


def test_parse_callback_url_with_query_in_path_split() -> None:
    # Arrange
    # Unusual: query embedded after scheme without standard parse query
    callback = f"{REDIRECT}/callback?state={STATE}&code=path-code"

    # Act
    result = helper._parse_callback(callback, expected_state=STATE)

    # Assert
    assert result["code"] == "path-code"
