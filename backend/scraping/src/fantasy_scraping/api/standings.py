"""Token-protected official classification read for the API service."""

from fastapi import APIRouter, Depends, Request

from fantasy_scraping.security import require_service_token
from fantasy_scraping.services.standings import OfficialStandingsSnapshot

router = APIRouter(prefix="/internal/scrape", dependencies=[Depends(require_service_token)])


@router.get("/standings", response_model=OfficialStandingsSnapshot, tags=["internal"])
async def get_official_standings(request: Request) -> OfficialStandingsSnapshot:
    """Return the current official table for API-side fixture reconciliation."""
    return await request.app.state.get_standings_service().get_standings()
