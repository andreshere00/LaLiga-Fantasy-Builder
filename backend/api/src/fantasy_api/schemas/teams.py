"""Team money and lineup schemas for OpenAPI / Swagger."""

from __future__ import annotations

from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from fantasy_api.schemas.common import FantasyWireModel, JsonObject, JsonValue


class TeamMoney(FantasyWireModel):
    """Cash and investment from ``GET /teams/{teamId}/money``.

    Rival teams often return empty or sparse objects; fields may be absent.
    """

    empty_payload_allowed: ClassVar[bool] = True

    team_money: int | None = None
    team_investment: int | None = None


class LineupFormation(FantasyWireModel):
    """Formation block nested under a Fantasy lineup response."""

    goalkeeper: list[JsonValue] | None = None
    defender: list[JsonValue] | None = None
    midfield: list[JsonValue] | None = None
    striker: list[JsonValue] | None = None
    coach: list[JsonValue] | None = None
    captain: str | int | None = None
    bench: JsonObject | list[JsonValue] | None = None
    tactical_formation: list[int] | None = None


class TeamLineup(FantasyWireModel):
    """Current or weekly lineup from Fantasy team lineup endpoints."""

    formation: LineupFormation | None = None
    team_id: str | int | None = None
    week_number: int | None = None


class LineupWrite(BaseModel):
    """Request body for ``PUT /teams/{teamId}/lineup``.

    Slot values are ``playerTeamId`` roster identifiers, not master
    ``playerId`` values. All base lineup slots are required because Fantasy
    treats PUT as a full replace. Premium leagues may also send ``coach``,
    ``captain``, and ``bench`` (unverified unofficial-client fields).
    """

    model_config = ConfigDict(extra="forbid")

    goalkeeper: str | int
    defender: list[str | int]
    midfield: list[str | int]
    striker: list[str | int]
    tactical_formation: list[int]
    coach: str | int | None = None
    captain: str | int | None = None
    bench: JsonObject | None = None
