"""Players HTTP controller (Fantasy catalog, market value, league card)."""

from __future__ import annotations

from fastapi import APIRouter, Header, Path

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.api.payload import as_model_list, parse_payload
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.payload import as_object
from fantasy_api.schemas.players import CatalogPlayer, LeaguePlayer, PlayerMarketValue

router = APIRouter(tags=["players"])

_PUBLIC_ERROR_RESPONSES: dict[int | str, dict] = {
    key: value for key, value in ERROR_RESPONSES.items() if key != 401
}


@router.get(
    "/players",
    response_model=list[CatalogPlayer],
    response_model_exclude_none=True,
    responses=_PUBLIC_ERROR_RESPONSES,
    summary="List competition players",
)
async def list_players() -> list[CatalogPlayer]:
    """Return the full public player catalog from Fantasy.

    No internal JWT or LaLiga bearer is required.

    Returns:
        Upstream player catalog JSON.
    """
    data = await get_container().players_service.list_players()
    return as_model_list(data, CatalogPlayer)


@router.get(
    "/players/{player_id}/market-value",
    response_model=list[PlayerMarketValue],
    response_model_exclude_none=True,
    responses=_PUBLIC_ERROR_RESPONSES,
    summary="Get player market-value history",
)
async def get_market_value(
    player_id: str = Path(description="Master footballer identifier."),
) -> list[PlayerMarketValue]:
    """Return public market-value history for a player.

    No internal JWT or LaLiga bearer is required.

    Args:
        player_id: Master footballer identifier.

    Returns:
        Upstream market-value history JSON.
    """
    data = await get_container().players_service.get_market_value(player_id)
    return as_model_list(data, PlayerMarketValue)


@router.get(
    "/players/{player_id}/league/{league_id}",
    response_model=LeaguePlayer,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get player card contextualized to a league",
)
async def get_league_player(
    player_id: str = Path(description="Master footballer identifier."),
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> LeaguePlayer:
    """Return a player card contextualized to a league.

    Path identifiers are master ``playerId`` values, not ``playerTeamId``
    squad-entry identifiers.

    Args:
        player_id: Master footballer identifier.
        league_id: Fantasy league identifier.
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Upstream league player JSON.
    """
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().players_service.get_league_player(
        internal_jwt, player_id, league_id
    )
    return LeaguePlayer.model_validate(parse_payload(as_object, data))
