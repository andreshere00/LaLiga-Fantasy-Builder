"""Real LALIGA classification controller with an internal JWT gate."""

from typing import Annotated

from fastapi import APIRouter, Header, Path, Query

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.common import ErrorResponse
from fantasy_api.schemas.standings import CompetitionStandings, StandingsQuery

router = APIRouter(tags=["standings"])


@router.get(
    "/competitions/{competition_id}/standings",
    response_model=CompetitionStandings,
    responses={
        **ERROR_RESPONSES,
        404: {"model": ErrorResponse, "description": "Unsupported season or competition."},
    },
    summary="Get real LALIGA club standings",
)
async def get_competition_standings(
    competition_id: Annotated[
        int, Path(ge=1, description="Application competition id; LALIGA is 1.")
    ],
    query: Annotated[StandingsQuery, Query()],
    authorization: Annotated[
        str | None, Header(description="Bearer auth-issued internal JWT.")
    ] = None,
) -> CompetitionStandings:
    """Return club rank, points, season totals, and the last five finalized league matches.

    The provider's table refreshes hourly. Request ``mode=completed`` for available
    data; ``mode=live`` returns 503 until a live standings source is verified.
    No LaLiga pairing is required. Provider and Fantasy club ids are mapped explicitly.

    Args:
        competition_id: Supported application competition id.
        query: Season starting year and classification mode.
        authorization: Internal application JWT.

    Returns:
        Complete club table with source freshness and cache metadata.
    """
    await get_current_user(authorization)
    return await get_container().standings_service.get_standings(
        competition_id,
        query.season,
        query.mode,
    )
