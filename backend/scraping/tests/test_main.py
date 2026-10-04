"""Health routes for the scraping process."""

import pytest
from fantasy_scraping.config import Settings, get_settings
from fantasy_scraping.main import create_app
from fastapi.testclient import TestClient
from pydantic import SecretStr

# ---- Mocks, fixtures & helpers ---- #


def _settings(*, token: str, debug: bool = False) -> Settings:
    return Settings(scraping_service_token=SecretStr(token), debug=debug)


# ---- Happy path ---- #


def test_get_settings_returns_settings_instance() -> None:
    assert isinstance(get_settings(), Settings)


def test_create_app_health_live_returns_ok() -> None:
    app = create_app(_settings(token="dev-scraping-token"))
    response = TestClient(app).get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_app_health_ready_returns_ok() -> None:
    app = create_app(_settings(token="dev-scraping-token"))
    response = TestClient(app).get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---- Error paths ---- #


def test_create_app_empty_token_raises() -> None:
    with pytest.raises(RuntimeError):
        create_app(_settings(token=""))


# ---- Edge cases ---- #


def test_create_app_empty_token_in_debug_starts() -> None:
    app = create_app(_settings(token="", debug=True))
    assert TestClient(app).get("/health/live").status_code == 200


def test_run_starts_uvicorn_on_configured_port(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_run(*_args: object, **kwargs: object) -> None:
        captured.update(kwargs)

    monkeypatch.setattr("fantasy_scraping.main.uvicorn.run", fake_run)
    from fantasy_scraping.main import run

    run()
    assert captured.get("port") == get_settings().service_port
