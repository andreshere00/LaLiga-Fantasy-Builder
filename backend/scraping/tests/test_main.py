"""Health routes for the scraping process."""

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from fantasy_scraping.config import Settings, get_settings
from fantasy_scraping.main import create_app

# ---- Mocks, fixtures & helpers ---- #


def _settings(*, token: str, debug: bool = False, expose_docs: bool = False) -> Settings:
    return Settings(
        scraping_service_token=SecretStr(token),
        debug=debug,
        expose_docs=expose_docs,
        _env_file=None,
    )


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


def test_create_app_expose_docs_serves_openapi() -> None:
    app = create_app(_settings(token="dev-scraping-token", expose_docs=True))
    client = TestClient(app)
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_create_app_without_expose_docs_hides_openapi() -> None:
    app = create_app(_settings(token="dev-scraping-token"))
    client = TestClient(app)
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


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
