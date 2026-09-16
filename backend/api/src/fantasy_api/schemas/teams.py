"""Team money and lineup schemas for OpenAPI / Swagger."""

from __future__ import annotations

from typing import Any

from fantasy_api.schemas.common import FlexibleModel


class TeamMoney(FlexibleModel):
    """Cash and investment from ``GET /teams/{teamId}/money``.

    Rival teams often return empty or sparse objects; fields may be absent.
    """

    teamMoney: int | None = None
    teamInvestment: int | None = None


class LineupFormation(FlexibleModel):
    """Formation block nested under a Fantasy lineup response."""

    goalkeeper: list[Any] | None = None
    defender: list[Any] | None = None
    midfield: list[Any] | None = None
    striker: list[Any] | None = None
    coach: list[Any] | None = None
    captain: str | int | None = None
    bench: dict[str, Any] | list[Any] | None = None
    tacticalFormation: list[int] | None = None


class TeamLineup(FlexibleModel):
    """Current or weekly lineup from Fantasy team lineup endpoints."""

    formation: LineupFormation | None = None
    teamId: str | int | None = None
    weekNumber: int | None = None


class LineupWrite(FlexibleModel):
    """Request body for ``PUT /teams/{teamId}/lineup``.

    Slot values are ``playerTeamId`` roster identifiers, not master
    ``playerId`` values. Premium leagues may also send ``coach``, ``captain``,
    and ``bench``.
    """

    goalkeeper: str | int | None = None
    defender: list[str | int] | None = None
    midfield: list[str | int] | None = None
    striker: list[str | int] | None = None
    tactical_formation: list[int] | None = None
    coach: str | int | None = None
    captain: str | int | None = None
    bench: dict[str, Any] | None = None
