"""Authenticated read-only lineup builder controller."""

from fastapi import APIRouter, Header

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.lineup_builder import BuildFailure, BuildPreferences, BuildResponse

router = APIRouter(tags=["lineup-builder"])


@router.post(
    "/lineup-builder/leagues/{league_id}/build",
    response_model=BuildResponse,
    responses={
        **ERROR_RESPONSES,
        409: {"model": BuildFailure, "description": "Build conflict"},
        503: {"model": BuildFailure, "description": "Required source or search unavailable"},
    },
    summary="Build read-only lineup recommendations",
)
async def build_lineup(
    league_id: str, preferences: BuildPreferences, authorization: str | None = Header(default=None)
) -> BuildResponse:
    """Return feasible lineup previews; all upstream operations are reads.

    Args:
        league_id: Caller-scoped Fantasy league.
        preferences: Sources, mandatory master IDs, supported tactics and trade permissions.
        authorization: Bearer internal JWT.

    Returns:
        Ranked XIs with score traces and conditional market-value projections.
    """
    _, jwt = await get_current_user(authorization)
    service = get_container().lineup_builder_service
    if service is None:
        raise UpstreamError(
            "builder is unavailable", status_code=503, category="builder_unavailable"
        )
    return await service.build(jwt, league_id, preferences)
