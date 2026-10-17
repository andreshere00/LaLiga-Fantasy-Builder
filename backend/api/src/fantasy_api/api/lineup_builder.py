"""Authenticated read-only lineup builder controller."""

from collections.abc import AsyncIterator

from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.lineup_builder import (
    BuildFailure,
    BuildPreferences,
    BuildResponse,
    BuildStreamEvent,
)

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


@router.post(
    "/lineup-builder/leagues/{league_id}/build/stream",
    response_class=StreamingResponse,
    response_model=BuildStreamEvent,
    responses={
        **ERROR_RESPONSES,
        200: {
            "content": {
                "application/x-ndjson": {
                    "schema": {"$ref": "#/components/schemas/BuildStreamEvent"}
                }
            }
        },
    },
    summary="Stream read-only lineup build progress and result",
)
async def stream_lineup(
    league_id: str, preferences: BuildPreferences, authorization: str | None = Header(default=None)
) -> StreamingResponse:
    """Stream progress then one result or sanitized error, with no retained job state.

    Args:
        league_id: League authorized against the verified caller's memberships.
        preferences: Same options as the synchronous read-only build.
        authorization: Bearer internal JWT.

    Returns:
        Newline-delimited events. After HTTP 200, failures are terminal error
        events carrying the logical status. Disconnect cancels the build.
    """
    _, jwt = await get_current_user(authorization)
    service = get_container().lineup_builder_service
    if service is None:
        raise UpstreamError(
            "builder is unavailable", status_code=503, category="builder_unavailable"
        )

    async def events() -> AsyncIterator[str]:
        """Serialize typed events and close the producer on client disconnect."""
        stream = service.stream(jwt, league_id, preferences)
        try:
            async for event in stream:
                yield event.model_dump_json() + "\n"
        finally:
            await stream.aclose()

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
