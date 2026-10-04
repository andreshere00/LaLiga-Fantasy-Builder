"""Private routes, settings, remote client and CLI."""

import json

import httpx
import pytest
from conftest import FakeSite
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from fantasy_scraping.config import Settings
from fantasy_scraping.main import create_app
from fantasy_scraping.scraper import cli
from fantasy_scraping.scraper.errors import InvalidRequestError
from fantasy_scraping.scraper.remote import RemoteError, RemoteScraper, _check_url
from fantasy_scraping.scraper.service import ScraperService
from fantasy_scraping.scraper.settings import ScraperSettings

TOKEN = {"X-Service-Token": "tok"}

# ---- Mocks, fixtures & helpers ---- #


@pytest.fixture
def client(service: ScraperService) -> TestClient:
    return TestClient(create_app(Settings(scraping_service_token=SecretStr("tok")), service))


@pytest.fixture
def debug_client(service: ScraperService) -> TestClient:
    return TestClient(
        create_app(Settings(scraping_service_token=SecretStr("tok"), debug=True), service)
    )


# ---- Happy path ---- #


def test_routes_resolve_with_token_returns_route(client: TestClient) -> None:
    response = client.get("/internal/scrape/routes", params={"name": "Raphinha"}, headers=TOKEN)

    assert response.status_code == 200
    assert response.json()["slug"] == "raphinha"


def test_players_batch_returns_per_item_errors_inside_200(client: TestClient) -> None:
    body = {"players": [{"name": "Raphinha"}, {"name": "Zzzz Qqqq"}], "season": "2026-27"}

    response = client.post("/internal/scrape/players", json=body, headers=TOKEN)

    results = response.json()["results"]
    assert response.status_code == 200
    assert results[0]["pages"][0]["kind"] == "player" and results[0]["error"] is None
    assert results[1]["error"]["error"] == "player_not_found"


def test_linked_data_summary_returns_counts_only(client: TestClient) -> None:
    response = client.get("/internal/scrape/linked-data", headers=TOKEN)

    assert response.json()["players"] == 18 and "player_slugs" not in response.json()
    assert client.post("/internal/scrape/linked-data/refresh", headers=TOKEN).status_code == 200


def test_cache_invalidate_returns_deleted_count(client: TestClient) -> None:
    assert client.post("/internal/scrape/cache/invalidate", json={}, headers=TOKEN).json() == {
        "deleted": 0
    }


def test_internal_health_returns_breaker_and_cache(client: TestClient) -> None:
    response = client.get("/internal/health", headers=TOKEN)

    body = response.json()
    assert response.status_code == 200
    assert body["breaker"] == "closed"
    assert body["index"] in {"missing", "loaded"}
    assert "entries" in body["cache"]


def test_probe_disabled_outside_debug_returns_404(client: TestClient) -> None:
    body = {"name": "Raphinha", "extract_rules": {"h1": "h1"}}

    assert client.post("/internal/scrape/probe", json=body, headers=TOKEN).status_code == 404


def test_probe_in_debug_returns_fragments(debug_client: TestClient) -> None:
    body = {"name": "Raphinha", "season": "2026-27", "extract_rules": {"body": "body"}}

    response = debug_client.post("/internal/scrape/probe", json=body, headers=TOKEN)

    assert response.status_code == 200
    assert response.json()["fragments"]["body"][0].startswith("<body>")


def test_internal_health_bad_token_returns_401(client: TestClient) -> None:
    assert client.get("/internal/health").status_code == 401


# ---- Error paths ---- #


@pytest.mark.parametrize("headers", [{}, {"X-Service-Token": "wrong"}])
def test_internal_routes_bad_token_return_401(client: TestClient, headers: dict[str, str]) -> None:
    assert client.get("/internal/scrape/linked-data", headers=headers).status_code == 401


def test_routes_ambiguous_name_returns_409_error_body(client: TestClient) -> None:
    response = client.get("/internal/scrape/routes", params={"name": "Gueye"}, headers=TOKEN)

    assert response.status_code == 409
    assert response.json() == {"error": "player_ambiguous", "detail": "player name is ambiguous"}


def test_routes_unknown_name_returns_404(client: TestClient) -> None:
    response = client.get("/internal/scrape/routes", params={"name": "Zzzz Qqqq"}, headers=TOKEN)

    assert response.status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"players": [{"name": "A"}], "extra": 1},
        {"players": [{"name": "A", "player_team_id": "9"}]},
        {"players": [{"name": "A"}] * 26},
        {"players": []},
    ],
)
def test_players_invalid_body_returns_422(client: TestClient, body: dict[str, object]) -> None:
    assert client.post("/internal/scrape/players", json=body, headers=TOKEN).status_code == 422


def test_scraper_settings_without_contact_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SCRAPER_CONTACT", raising=False)

    with pytest.raises(ValidationError):
        ScraperSettings(_env_file=None)


@pytest.mark.parametrize("timeout", [10, 100_000])
def test_scraper_settings_timeout_out_of_range_raises(timeout: int) -> None:
    with pytest.raises(ValidationError):
        ScraperSettings(contact="a@b.co", timeout_ms=timeout)


# ---- Edge cases ---- #


def test_health_live_works_without_scraper_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SCRAPER_CONTACT", raising=False)
    app = create_app(Settings(scraping_service_token=SecretStr("tok")))

    assert TestClient(app).get("/health/live").status_code == 200


def test_cli_parser_has_no_flag_to_disable_robots_or_limits() -> None:
    help_text = cli._parser().format_help() + "".join(
        action.format_help()
        for action in cli._parser()._subparsers._group_actions[0].choices.values()
    )

    assert "robots" not in help_text and "rate" not in help_text


def test_cli_scrape_writes_html_and_prints_metadata(
    monkeypatch: pytest.MonkeyPatch, service: ScraperService, tmp_path, capsys, site: FakeSite
) -> None:
    class Client:
        async def aclose(self) -> None:
            return None

    monkeypatch.setattr("fantasy_scraping.main.build_service", lambda: (service, Client()))

    code = cli.main(["scrape", "Raphinha", "--season", "2026-27", "--out", str(tmp_path), "--json"])

    assert code == 0
    assert json.loads(capsys.readouterr().out)["pages"][0]["player_slug"] == "raphinha"
    assert (tmp_path / "raphinha-player-laliga-26-27.html").exists()


def test_cli_resolve_unknown_name_exits_one(
    monkeypatch: pytest.MonkeyPatch, service: ScraperService, capsys
) -> None:
    class Client:
        async def aclose(self) -> None:
            return None

    monkeypatch.setattr("fantasy_scraping.main.build_service", lambda: (service, Client()))

    assert cli.main(["resolve", "Zzzz Qqqq", "--season", "2026-27"]) == 1
    assert "player_not_found" in capsys.readouterr().err


def test_remote_scraper_rejects_public_http() -> None:
    with pytest.raises(InvalidRequestError):
        _check_url("http://evil.example")


def test_remote_scraper_requires_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SCRAPING_SERVICE_TOKEN", raising=False)

    with pytest.raises(InvalidRequestError):
        RemoteScraper("http://localhost:8002")


def test_remote_scraper_sends_token_and_maps_errors(
    monkeypatch: pytest.MonkeyPatch, service: ScraperService
) -> None:
    monkeypatch.setenv("SCRAPING_SERVICE_TOKEN", "tok")
    app = create_app(Settings(scraping_service_token=SecretStr("tok")), service)
    remote = RemoteScraper("http://localhost", transport=_test_transport(TestClient(app)))

    route = remote.call(
        "GET", "/internal/scrape/routes", params={"name": "Raphinha", "season": "2026-27"}
    )

    assert route["slug"] == "raphinha"
    with pytest.raises(RemoteError) as info:
        remote.call(
            "GET", "/internal/scrape/routes", params={"name": "Zzzz Qqqq", "season": "2026-27"}
        )
    assert info.value.category == "player_not_found"
    remote.close()


def test_cli_service_url_uses_remote_client(
    monkeypatch: pytest.MonkeyPatch, service: ScraperService, capsys
) -> None:
    monkeypatch.setenv("SCRAPING_SERVICE_TOKEN", "tok")
    app = create_app(Settings(scraping_service_token=SecretStr("tok")), service)
    http = TestClient(app)

    class PatchedRemote(RemoteScraper):
        def __init__(self, base_url: str, transport: httpx.BaseTransport | None = None) -> None:
            super().__init__(base_url, transport=transport or _test_transport(http))

    monkeypatch.setattr(cli, "RemoteScraper", PatchedRemote)

    code = cli.main(
        [
            "resolve",
            "Raphinha",
            "--season",
            "2026-27",
            "--service-url",
            "http://localhost",
            "--json",
        ]
    )

    assert code == 0
    assert json.loads(capsys.readouterr().out)["slug"] == "raphinha"


def _test_transport(client: TestClient) -> httpx.BaseTransport:
    """Bridge httpx transport to FastAPI TestClient."""

    class Bridge(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            response = client.request(
                request.method,
                request.url.path,
                params=request.url.params,
                headers=dict(request.headers),
                content=request.content,
            )
            return httpx.Response(
                response.status_code, headers=response.headers, content=response.content
            )

    return Bridge()
