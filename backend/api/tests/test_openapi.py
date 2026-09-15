# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from pathlib import Path

import pytest
from fantasy_api.main import create_app
from fantasy_api.openapi import (
    build_openapi_schema,
    enrich_operation_from_docstring,
    generate_openapi,
    write_openapi,
)
from fantasy_api.schemas.common import MeResponse
from fastapi.testclient import TestClient


# ---- Happy path ---- #


def test_build_openapi_schema_includes_documented_paths() -> None:
    # Arrange
    app = create_app()

    # Act
    schema = build_openapi_schema(app)

    # Assert
    paths = schema["paths"]
    assert "/me" in paths
    assert "/laliga/credential-probe" in paths
    assert "/laliga/leagues-probe" in paths
    assert "/leagues" in paths
    assert "/leagues/{league_id}/standing" in paths
    assert "/leagues/{league_id}/standing/{week}" in paths
    assert "/leagues/{league_id}/activity/{page}" in paths
    assert "/leagues/{league_id}/teams" in paths
    assert "/leagues/{league_id}/teams/{team_id}" in paths
    assert "/health" in paths
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    assert "MeResponse" in schema["components"]["schemas"]
    assert "FantasyLeague" in schema["components"]["schemas"]
    assert "StandingRow" in schema["components"]["schemas"]
    assert "ErrorResponse" in schema["components"]["schemas"]
    assert paths["/leagues"]["get"]["security"] == [{"HTTPBearer": []}]
    assert "summary" in paths["/leagues"]["get"]


def test_generate_openapi_writes_file(tmp_path: Path) -> None:
    # Arrange
    output = tmp_path / "openapi.json"

    # Act
    schema = generate_openapi(output=output)

    # Assert
    assert output.is_file()
    assert schema["info"]["title"]
    assert '"/leagues"' in output.read_text(encoding="utf-8")


def test_write_openapi_creates_parent_dirs(tmp_path: Path) -> None:
    # Arrange
    output = tmp_path / "docs" / "api" / "openapi.json"

    # Act
    write_openapi({"openapi": "3.1.0", "info": {"title": "t", "version": "0"}}, output)

    # Assert
    assert output.is_file()


# ---- Error paths ---- #


def test_enrich_operation_from_docstring_noop_without_doc() -> None:
    # Arrange
    operation: dict = {}

    def endpoint() -> None:
        return None

    # Act
    enrich_operation_from_docstring(operation, endpoint)

    # Assert
    assert operation == {}


# ---- Edge cases ---- #


def test_enrich_operation_from_docstring_uses_summary_and_body() -> None:
    # Arrange
    operation: dict = {}

    def endpoint() -> MeResponse:
        """Return the authenticated user from the internal JWT.

        Extra description line.

        Args:
            authorization: Bearer token.
        """
        return MeResponse(user_id="1")

    # Act
    enrich_operation_from_docstring(operation, endpoint)

    # Assert
    assert operation["summary"] == "Return the authenticated user from the internal JWT."
    assert "Extra description line." in operation["description"]


def test_openapi_cli_main_writes_default_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange
    target = tmp_path / "out.json"
    monkeypatch.setattr(
        "fantasy_api.openapi.default_openapi_path",
        lambda: target,
    )

    # Act
    from fantasy_api.openapi import main as openapi_main

    code = openapi_main([])

    # Assert
    assert code == 0
    assert target.is_file()
    assert "Wrote OpenAPI" in capsys.readouterr().out


def test_openapi_cli_main_stdout(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Arrange / Act
    from fantasy_api.openapi import main as openapi_main

    code = openapi_main(["--stdout"])

    # Assert
    assert code == 0
    payload = capsys.readouterr().out
    assert '"/leagues"' in payload


def test_swagger_openapi_route_matches_generated_schema() -> None:
    # Arrange
    app = create_app()

    # Act
    with TestClient(app) as client:
        live = client.get("/openapi.json").json()
    generated = build_openapi_schema(create_app())

    # Assert — Swagger uses the same generator (paths + security)
    assert set(live["paths"]) == set(generated["paths"])
    assert live["components"]["securitySchemes"] == generated["components"][
        "securitySchemes"
    ]
