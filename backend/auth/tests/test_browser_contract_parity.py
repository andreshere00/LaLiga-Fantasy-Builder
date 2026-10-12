"""Shared response cases enforce independently packaged browser DTO contracts."""

# ---- Mocks, fixtures & helpers ---- #

import json
from pathlib import Path

import pytest
from fantasy_auth.cli.browser_session.contracts import (
    require_recognized_response,
    response_adapter,
    validate_lineup_write,
)

CASES = []
for case in json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/schema-validation-fixtures.json").read_text()
):
    if case["kind"] != "response":
        continue
    try:
        response_adapter(case["method"], case["path"].removeprefix("/api"))
    except ValueError:
        continue
    CASES.append(case)


# ---- Happy path ---- #


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_validate_shared_response_matches_contract(case: dict) -> None:
    adapter = response_adapter(case["method"], case["path"].removeprefix("/api"))
    if case["valid"]:
        require_recognized_response(adapter.validate_python(case["payload"]))
    else:
        with pytest.raises(ValueError):
            require_recognized_response(adapter.validate_python(case["payload"]))


def test_validate_lineup_write_omitted_premium_fields_preserves_omissions() -> None:
    body = {
        "goalkeeper": "g",
        "defender": [],
        "midfield": [],
        "striker": [],
        "tactical_formation": [4, 4, 2],
    }
    assert validate_lineup_write(body) == body
