"""Read-only real-club dossier."""

from typing import Annotated

from fastapi import APIRouter, Header, Path

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.clubs import ClubDossier, ClubIndex, RosterStats
from fantasy_api.schemas.common import ErrorResponse

router = APIRouter(tags=["clubs"])


@router.get(
    "/clubs",
    response_model=ClubIndex,
    responses=ERROR_RESPONSES,
    summary="List current LaLiga clubs",
)
async def list_clubs(
    authorization: Annotated[str | None, Header()] = None,
) -> ClubIndex:
    """Return teams-master identity and the verified FutbolFantasy slug.

    Args:
        authorization: Internal application JWT.

    Returns:
        The current clubs. A missing slug is null and the club stays listed.
    """
    await get_current_user(authorization)
    return await get_container().clubs_service.list_clubs()


@router.get(
    "/clubs/{club_id}",
    response_model=ClubDossier,
    responses={
        **ERROR_RESPONSES,
        404: {"model": ErrorResponse, "description": "Unknown club."},
    },
    summary="Read one real-club dossier",
)
async def get_club(
    club_id: Annotated[int, Path(ge=1)],
    authorization: Annotated[str | None, Header()] = None,
) -> ClubDossier:
    """Return roster, results, and scraped sections for one current club.

    A failed section is omitted and listed in ``segment_errors``. The response
    does not include HTML, tokens, or upstream bodies. Radar and player form
    stay on the existing player routes.

    Args:
        club_id: Teams-master id.
        authorization: Internal application JWT.

    Returns:
        The dossier for that club.
    """
    await get_current_user(authorization)
    return await get_container().clubs_service.get_dossier(club_id)


@router.get(
    "/clubs/{club_id}/roster-stats",
    response_model=RosterStats,
    responses={
        **ERROR_RESPONSES,
        404: {"model": ErrorResponse, "description": "Unknown club."},
    },
    summary="Read LaLiga season totals for one club's squad",
)
async def get_club_roster_stats(
    club_id: Annotated[int, Path(ge=1)],
    authorization: Annotated[str | None, Header()] = None,
) -> RosterStats:
    """Return minutes, goals, assists and the other season counts per footballer.

    Counts come from each footballer's FutbolFantasy profile (LaLiga season totals).
    A footballer whose page could not be read is ``available: false`` with null
    counts; null is never converted to zero. The first read of a club can take
    several seconds because each profile is fetched through the rate-limited
    scraper, then it is cached.

    Args:
        club_id: Teams-master id.
        authorization: Internal application JWT.

    Returns:
        Per-footballer counts, club totals over published counts, and coverage.
    """
    await get_current_user(authorization)
    return await get_container().clubs_service.get_roster_stats(club_id)
