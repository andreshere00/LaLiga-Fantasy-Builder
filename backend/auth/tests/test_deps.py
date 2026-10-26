"""Verification-only dependencies: no application session or signing key."""

# ---- Mocks, fixtures & helpers ---- #
import base64

import pytest
from fantasy_auth.api import deps
from fantasy_auth.config import Settings
from fantasy_auth.domain.errors import SessionError

from tests.test_api import Identity


def settings(**kwargs):
    return Settings(
        _env_file=None,
        token_vault_key_base64=base64.b64encode(b"t" * 32).decode(),
        internal_service_token="service",
        **kwargs,
    )


# ---- Happy path ---- #
@pytest.mark.asyncio
async def test_require_internal_user_verified_subject_returns_owner():
    container = deps.build_container(settings(), jwt_validator=Identity())
    deps.set_container(container)
    assert (await deps.require_internal_user("Bearer alice")).user_id == "alice"
    assert deps.get_settings_dep() is container.settings
    deps.require_service_token("service")


def test_build_container_production_has_no_signing_secret():
    container = deps.build_container(
        settings(use_memory_store=False, database_url="postgresql://db", redis_url="redis://cache"),
        pg_pool=object(),
        redis=object(),
    )
    assert container.browser_pairings is not None
    assert container.jwt_validator is not None
    assert not hasattr(container, "sessions")


# ---- Error paths ---- #
@pytest.mark.asyncio
@pytest.mark.parametrize("header", [None, "", "Basic x", "Bearer ", "Bearer forged"])
async def test_require_internal_user_bad_bearer_rejected(header):
    deps.set_container(deps.build_container(settings(), jwt_validator=Identity()))
    with pytest.raises(SessionError):
        await deps.require_internal_user(header)


@pytest.mark.parametrize("token", [None, "", "wrong"])
def test_require_service_token_invalid_rejected(token):
    deps.set_container(deps.build_container(settings()))
    with pytest.raises(SessionError):
        deps.require_service_token(token)


def test_build_container_missing_production_dependencies_rejected():
    with pytest.raises(RuntimeError, match="pg_pool"):
        deps.build_container(
            settings(
                use_memory_store=False, database_url="postgresql://db", redis_url="redis://cache"
            )
        )
