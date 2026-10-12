"""Schema changes must activate the generated-artifact pre-commit gate."""

# ---- Mocks, fixtures & helpers ---- #

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
CONFIG = (ROOT / ".pre-commit-config.yaml").read_text()
BLOCK = CONFIG.split("- id: generate-openapi", 1)[1].split("- id:", 1)[0]
PATTERN = " ".join(BLOCK.split("files: >-", 1)[1].splitlines()).strip()

# ---- Happy path ---- #


@pytest.mark.parametrize(
    "path",
    [
        "backend/api/src/fantasy_api/api/players.py",
        "backend/api/src/fantasy_api/schemas/players.py",
        "backend/auth/src/fantasy_auth/api/schemas.py",
        "backend/scraping/src/fantasy_scraping/api/players.py",
        "backend/scraping/src/fantasy_scraping/parser/models/player.py",
        "backend/scraping/src/fantasy_scraping/scraper/models.py",
        "docs/api/endpoint-schemas.md",
    ],
)
def test_generated_artifact_hook_schema_change_matches(path: str) -> None:
    assert re.search(PATTERN, path)
