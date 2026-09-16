"""Players HTTP controller (public catalog/value + authenticated league card)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Header, Path
from pydantic import BaseModel

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.leagues import as_object, as_object_list
from fantasy_api.schemas.players import CatalogPlayer, LeaguePlayerCard, MarketValuePoint

router = APIRouter(tags=["players"])


@router.get(
    "/players",
    response_model=list[CatalogPlayer],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="List competition players",
)
async def list_players() -> list[CatalogPlayer]:
    """Return the public Fantasy player catalog.

    Includes status, market value, and points. This route does not require
    an internal JWT; Fantasy is called without a LaLiga bearer.

    Returns:
        Upstream catalog JSON.
    """
    data = await get_container().players_service.list_players()
    return _as_model_list(data, CatalogPlayer)


@router.get(
    "/player/{player_id}/market-value",
    response_model=list[MarketValuePoint],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get player market-value history",
)
async def get_market_value(
    player_id: str = Path(description="Master Fantasy player identifier."),
) -> list[MarketValuePoint]:
    """Return public market-value history for a player.

    This route does not require an internal JWT; Fantasy is called without a
    LaLiga bearer.

    Args:
        player_id: Master Fantasy player identifier.

    Returns:
        Upstream market-value history JSON.
    """
    data = await get_container().players_service.get_market_value(player_id)
    return _as_model_list(data, MarketValuePoint)


@router.get(
    "/player/{player_id}/league/{league_id}",
    response_model=LeaguePlayerCard,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get league-scoped player card",
)
async def get_player_in_league(
    player_id: str = Path(description="Master Fantasy player identifier."),
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> LeaguePlayerCard:
    """Return a player card contextualized to a Fantasy league.

    ``playerId`` is the master catalog id, not ``playerTeamId``.

    Args:
        player_id: Master Fantasy player identifier.
        league_id: Fantasy league identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream league-scoped player JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().players_service.get_player_in_league(
        internal_jwt,
        player_id,
        league_id,
    )
    return LeaguePlayerCard.model_validate(_parse_payload(as_object, data))


def _as_model_list[TModel: BaseModel](
    data: object,
    model: type[TModel],
) -> list[TModel]:
    """Coerce upstream JSON into a list of Pydantic models.

    Args:
        data: Upstream payload (list or wrapped object).
        model: Target model class.

    Returns:
        Validated model list.

    Raises:
        UpstreamError: When the payload is not a collection of objects.
    """
    return [model.model_validate(item) for item in _parse_payload(as_object_list, data)]


def _parse_payload[T](parser: Callable[[Any], T], data: object) -> T:
    """Run a payload parser and map shape errors to UpstreamError."""
    try:
        return parser(data)
    except ValueError as exc:
        raise UpstreamError(
            "fantasy payload had an unexpected shape",
            status_code=502,
            category="fantasy_error",
        ) from exc
