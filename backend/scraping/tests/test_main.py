"""Health routes for the scraping process."""

import pytest
from fantasy_scraping.config import Settings
from fantasy_scraping.main import create_app
from fastapi.testclient import TestClient
from pydantic import SecretStr

# ---- Mocks, fixtures & helpers ---- #


def _settings(*, token: str, debug: bool = False) -> Settings:
    return Settings(scraping_service_token=SecretStr(token), debug=debug)


# ---- Happy path ---- #


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
