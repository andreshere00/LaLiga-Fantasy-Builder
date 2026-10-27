"""LaLiga routes preserve delegation semantics with Better Auth JWT ownership."""

# ---- Mocks, fixtures & helpers ---- #
import base64
import time
from urllib.parse import parse_qs, urlencode, urlparse

import pytest
from fantasy_auth.api.deps import build_container
from fantasy_auth.config import Settings
from fantasy_auth.domain.errors import ValidationError
from fantasy_auth.domain.tokens import TokenBundle
from fantasy_auth.main import create_app
from fantasy_auth.ports.repos import BrowserPairingRecord
from fastapi.testclient import TestClient


class Identity:
    def validate(self, token):
        if token not in {"alice", "bob"}:
            raise ValidationError("invalid application token")
        return {"sub": token}


class B2C:
    def build_authorize_url(self, **kwargs):
        return "https://login.laliga.es/authorize?" + urlencode(kwargs)

    async def exchange_code(self, **kwargs):
        return TokenBundle(
            access_token="private-laliga",
            id_token="private-id",
            refresh_token="private-refresh",
            expires_on=int(time.time()) + 3600,
            expires_in=3600,
            client_id="client",
            policy="policy",
            scope="openid",
        )


class Jwks:
    async def validate(self, token, **kwargs):
        return {"sub": "manager", "nonce": kwargs.get("nonce")}


class Fantasy:
    async def get_current_user(self, bearer):
        return {"id": "manager", "managerName": "Manager"}


@pytest.fixture
def container():
    cfg = Settings(
        _env_file=None,
        use_memory_store=True,
        token_vault_key_base64=base64.b64encode(b"t" * 32).decode(),
        internal_service_token="service",
        frontend_origin="https://app.example.test",
        laliga_browser_redirect_uri="https://app.example.test/laliga/callback",
    )
    result = build_container(cfg, jwt_validator=Identity())
    result.pairings._b2c = B2C()
    result.pairings._jwks = Jwks()
    result.pairings._fantasy = Fantasy()
    return result


@pytest.fixture
def client(container):
    with TestClient(
        create_app(container.settings, container), base_url="https://app.example.test"
    ) as client:
        yield client


def headers(user="alice"):
    return {"Authorization": f"Bearer {user}"}


# ---- Happy path ---- #
def test_link_options_reports_configured_methods_for_verified_owner(client, container):
    # Arrange / Act / Assert
    response = client.get("/laliga/link-options", headers=headers())
    assert response.status_code == 200
    assert response.json() == {
        "browser_available": True,
        "helper_available": False,
        "helper_platforms": [],
        "user_id": "alice",
        "email": None,
        "name": None,
    }
    container.settings.laliga_helper_enabled = True
    enabled = client.get("/laliga/link-options", headers=headers("bob"))
    assert enabled.json()["helper_platforms"] == ["macos"]
    assert enabled.json()["user_id"] == "bob"
    assert client.get("/laliga/link-options").status_code == 401


def test_pairing_browser_callback_preserves_owner_without_cookies(client, container):
    start = client.post("/laliga/login", headers=headers())
    assert start.status_code == 200
    assert parse_qs(urlparse(start.json()["authorize_url"]).query)["redirect_uri"] == [
        "https://app.example.test/laliga/callback"
    ]
    records = container.browser_pairings._records
    challenge = next(iter(records.values()))
    assert challenge.secret not in start.text
    assert challenge.code_verifier not in start.text
    callback = f"/laliga/callback?code=code&state={challenge.state}"
    result = client.get(callback, follow_redirects=False)
    assert result.status_code == 303
    assert result.headers["location"] == "https://app.example.test"
    assert "private" not in result.headers["location"]
    assert client.get("/laliga/connection", headers=headers()).json()["linked"]
    assert not client.get("/laliga/connection", headers=headers("bob")).json()["linked"]
    assert "lfb_laliga_bind=" in result.headers["set-cookie"]
    assert "Max-Age=0" in result.headers["set-cookie"]
    replay = client.get(callback, follow_redirects=False)
    assert replay.headers["location"] == (
        "https://app.example.test/connect-laliga?error=laliga_link_failed"
    )
    assert client.delete("/laliga/connection", headers=headers()).status_code == 200
    assert not client.get("/laliga/connection", headers=headers()).json()["linked"]


def test_pairing_helper_completion_private_bearer_and_retry_contract(client):
    created = client.post("/laliga/pairings", headers=headers()).json()
    result = client.post(
        f"/laliga/pairings/{created['pairing_id']}/complete",
        json={
            "secret": created["secret"],
            "token_response": {
                "access_token": "private-laliga",
                "id_token": "private-id",
                "refresh_token": "private-refresh",
                "expires_in": 3600,
            },
        },
    )
    assert result.status_code == 200
    assert result.json()["user_id"] == "alice"
    assert "private-laliga" not in result.text
    private = {**headers(), "X-Service-Token": "service"}
    result = client.get("/internal/laliga/bearer", headers=private)
    assert result.status_code == 200
    assert result.json()["bearer_token"] == "private-laliga"
    assert client.get("/internal/laliga/bearer", headers=headers()).status_code == 401
    assert (
        client.get(
            "/internal/laliga/bearer", headers={**headers("bob"), "X-Service-Token": "service"}
        ).status_code
        == 401
    )


def test_pending_native_callback_remains_compatible(client, container):
    """A pre-cutover native challenge can still complete through the helper route."""
    import asyncio

    async def prepare() -> str:
        started = await container.pairings.begin_browser_login(
            "alice", redirect_uri=container.settings.laliga_redirect_uri
        )
        await container.browser_pairings.save(
            BrowserPairingRecord(
                state=started.b2c_state,
                user_id="alice",
                pairing_id=started.pairing_id,
                secret=started.secret,
                code_verifier=started.code_verifier,
                expires_at=container.clock.now() + 600,
            ),
            now=container.clock.now(),
        )
        return started.b2c_state

    state = asyncio.run(prepare())
    callback = f"authredirect://com.lfp.laligafantasy/?code=code&state={state}"
    result = client.post("/laliga/pairings/complete-redirect", json={"callback": callback})
    assert result.status_code == 200
    assert client.get("/laliga/connection", headers=headers()).json()["linked"]


# ---- Error paths ---- #
def test_browser_callback_without_binding_cookie_is_rejected_and_keeps_challenge(client, container):
    client.post("/laliga/login", headers=headers())
    challenge = next(iter(container.browser_pairings._records.values()))
    victim = TestClient(
        create_app(container.settings, container), base_url="https://app.example.test"
    )

    result = victim.get(
        f"/laliga/callback?code=code&state={challenge.state}", follow_redirects=False
    )

    assert result.headers["location"].endswith("error=laliga_link_failed")
    assert challenge.state in container.browser_pairings._records
    assert not client.get("/laliga/connection", headers=headers()).json()["linked"]


def test_browser_callback_with_other_browsers_cookie_is_rejected(client, container):
    client.post("/laliga/login", headers=headers())
    challenge = next(iter(container.browser_pairings._records.values()))
    victim = TestClient(
        create_app(container.settings, container), base_url="https://app.example.test"
    )
    victim.cookies.set("lfb_laliga_bind", "forged", path="/laliga/callback")

    result = victim.get(
        f"/laliga/callback?code=code&state={challenge.state}", follow_redirects=False
    )

    assert result.headers["location"].endswith("error=laliga_link_failed")
    assert challenge.state in container.browser_pairings._records


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/laliga/pairings"),
        ("POST", "/laliga/login"),
        ("GET", "/laliga/connection"),
        ("DELETE", "/laliga/connection"),
        ("DELETE", "/laliga/pairings"),
    ],
)
def test_routes_legacy_cookie_without_jwt_rejected(client, method, path):
    client.cookies.set("fantasy_session", "old-session")
    assert client.request(method, path).status_code == 401
    assert client.request(method, path, headers=headers("invalid")).status_code == 401


@pytest.mark.parametrize(
    "path", ["/auth/login", "/auth/callback", "/auth/me", "/.well-known/jwks.json"]
)
def test_application_auth_python_routes_removed(client, path):
    assert client.get(path).status_code == 404


def test_pairing_cancellation_expiry_and_input_validation(client, container):
    client.post("/laliga/login", headers=headers())
    challenge = next(iter(container.browser_pairings._records.values()))
    assert client.delete("/laliga/pairings", headers=headers("bob")).status_code == 200
    assert challenge.state in container.browser_pairings._records
    assert client.delete("/laliga/pairings", headers=headers()).status_code == 200
    callback = f"authredirect://com.lfp.laligafantasy?code=code&state={challenge.state}"
    assert (
        client.get(f"/laliga/callback?code=code&state={challenge.state}", follow_redirects=False)
        .headers["location"]
        .endswith("error=laliga_link_failed")
    )
    assert (
        client.post(
            "/laliga/pairings/complete-redirect", json={"callback": callback, "user_id": "bob"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/laliga/pairings/id/complete", json={"secret": "12345678", "user_id": "bob"}
        ).status_code
        == 422
    )


# ---- Edge cases ---- #
def test_browser_redirect_requires_matching_https_frontend_origin():
    with pytest.raises(ValueError, match="HTTPS frontend"):
        Settings(
            _env_file=None,
            frontend_origin="https://app.example.test",
            laliga_browser_redirect_uri="https://other.example.test/laliga/callback",
        )


def test_browser_start_without_registered_callback_fails_closed(container):
    container.settings.laliga_browser_redirect_uri = None
    with TestClient(create_app(container.settings, container)) as client:
        result = client.post("/laliga/login", headers=headers())
    assert result.status_code == 503
    assert result.json()["error"] == "browser_unavailable"
    assert not container.browser_pairings._records


def test_pairing_rate_limit_rejects_repeated_callbacks(client, container):
    container.settings.pairing_rate_limit_per_minute = 1
    assert (
        client.post(
            "/laliga/pairings/complete-redirect", json={"callback": "authredirect://missing"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/laliga/pairings/complete-redirect", json={"callback": "authredirect://missing"}
        ).status_code
        == 429
    )


@pytest.mark.asyncio
async def test_pairing_cancel_before_completion_rejects_attach(container):
    created = await container.pairings.create_pairing("alice")
    await container.pairings.cancel("alice")
    with pytest.raises(Exception, match="already used"):
        await container.pairings.complete_pairing(
            pairing_id=created.pairing_id, secret=created.secret, token_response={}
        )
