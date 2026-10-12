"""Shared valid/invalid cases consumed by Python, browser-session and Zod."""

# ---- Mocks, fixtures & helpers ---- #

import json
from pathlib import Path

import pytest
from fantasy_api.cli.contracts import dump_validated_response, query_adapter, validate_response
from fantasy_api.schemas.buyout import IncreaseBuyoutWrite, PayBuyoutWrite
from fantasy_api.schemas.market import BidWrite, ListingWrite
from pydantic import ValidationError

CASES = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/schema-validation-fixtures.json").read_text()
)


def _validate(case: dict) -> object:
    """Apply the Python consumer contract selected by the fixture."""
    path = case["path"].removeprefix("/api")
    if case["kind"] == "response":
        return validate_response(path, case["payload"])
    if case["kind"] == "query":
        return query_adapter(path).validate_python(case["payload"])
    if path.endswith("/bids"):
        model = BidWrite
    elif path.endswith("/listings"):
        model = ListingWrite
    elif path.endswith("/pay"):
        model = PayBuyoutWrite
    else:
        model = IncreaseBuyoutWrite
    return model.model_validate(case["payload"])


# ---- Happy path ---- #


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_validate_shared_case_matches_contract(case: dict) -> None:
    if case["valid"]:
        value = _validate(case)
        if "serialized" in case:
            assert dump_validated_response(value) == case["serialized"]
    else:
        with pytest.raises((ValueError, ValidationError)):
            _validate(case)
