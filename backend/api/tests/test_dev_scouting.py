"""Local upgrades share credentials without replacing existing configuration."""

# ---- Mocks, fixtures & helpers ---- #
import importlib.util
import subprocess
from pathlib import Path

import pytest
from dotenv import dotenv_values

SCRIPT = Path(__file__).resolve().parents[3] / "scripts/dev_scouting.py"
spec = importlib.util.spec_from_file_location("dev_scouting", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.fixture
def local(tmp_path, monkeypatch):
    monkeypatch.delenv("SCOUTING_SERVICE_TOKEN", raising=False)
    monkeypatch.delenv("SCOUTING_DATABASE_URL", raising=False)
    for file in (".env", "backend/api/.env", "backend/auth/.env"):
        path = tmp_path / file
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("EXISTING=keep\n")
    return tmp_path


# ---- Happy path ---- #
def test_prepare_existing_envs_adds_shared_token_and_database_idempotently(local, monkeypatch):
    calls = []
    monkeypatch.setattr(
        module.subprocess, "run", lambda *args, **kwargs: calls.append((args, kwargs))
    )
    module.prepare(local)
    values = [
        dotenv_values(local / file) for file in (".env", "backend/api/.env", "backend/auth/.env")
    ]
    assert len({value["SCOUTING_SERVICE_TOKEN"] for value in values}) == 1
    assert len(values[0]["SCOUTING_SERVICE_TOKEN"]) >= 32
    assert all(value["EXISTING"] == "keep" for value in values)
    assert values[1]["SCOUTING_DATABASE_URL"].endswith("@localhost:5432/fantasy_app")
    assert "SCOUTING_SERVICE_TOKEN" not in repr(calls)
    before = (local / "backend/api/.env").read_text()
    module.prepare(local)
    assert (local / "backend/api/.env").read_text() == before
    assert "WHERE NOT EXISTS" in calls[0][1]["input"]
    assert calls[0][1]["capture_output"]


def test_prepare_custom_database_preserves_settings_without_provisioning(local, monkeypatch):
    custom = local / "backend/api/.env"
    custom.write_text(
        "SCOUTING_DATABASE_URL=postgresql://custom/db\nSCOUTING_SERVICE_TOKEN=existing\n"
    )
    monkeypatch.setattr(
        module.subprocess, "run", lambda *a, **kw: pytest.fail("custom DB modified")
    )
    module.prepare(local)
    assert dotenv_values(local / "backend/auth/.env")["SCOUTING_SERVICE_TOKEN"] == "existing"
    assert dotenv_values(custom)["SCOUTING_DATABASE_URL"] == "postgresql://custom/db"


# ---- Error paths ---- #
def test_prepare_conflicting_tokens_fails_without_replacing_values(local):
    (local / "backend/api/.env").write_text("SCOUTING_SERVICE_TOKEN=one\n")
    (local / "backend/auth/.env").write_text("SCOUTING_SERVICE_TOKEN=two\n")
    with pytest.raises(RuntimeError, match="differs"):
        module.prepare(local)
    assert dotenv_values(local / "backend/api/.env")["SCOUTING_SERVICE_TOKEN"] == "one"


def test_prepare_database_failure_sanitizes_output_and_does_not_save_url(local, monkeypatch):
    def fail(*args, **kwargs):
        raise subprocess.CalledProcessError(1, args[0], stderr="private-password")

    monkeypatch.setattr(module.subprocess, "run", fail)
    with pytest.raises(RuntimeError) as error:
        module.prepare(local)
    assert "private-password" not in str(error.value)
    assert "SCOUTING_DATABASE_URL" not in dotenv_values(local / "backend/api/.env")
