"""Pydantic schemas for leagues endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LeaguesProbeResponse(BaseModel):
    """Redacted connectivity probe for Fantasy leagues.

    Attributes:
        ok: True when Fantasy returned a successful leagues payload.
        league_count: Number of leagues discovered.
        league_ids: Upstream league identifiers when present.
    """

    ok: bool
    league_count: int = Field(ge=0)
    league_ids: list[Any] = Field(default_factory=list)


def summarize_leagues_payload(data: Any) -> tuple[int, list[Any]]:
    """Extract count and ids from a Fantasy leagues payload.

    Args:
        data: Upstream JSON (list or object wrapping a list).

    Returns:
        Tuple of league count and id list.
    """
    if isinstance(data, list):
        leagues = data
    elif isinstance(data, dict):
        nested = data.get("leagues")
        leagues = nested if isinstance(nested, list) else []
    else:
        leagues = []

    league_ids: list[Any] = []
    for item in leagues:
        if isinstance(item, dict) and "id" in item:
            league_ids.append(item["id"])
    return len(leagues), league_ids
