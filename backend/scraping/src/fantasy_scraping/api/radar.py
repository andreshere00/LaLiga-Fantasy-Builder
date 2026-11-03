"""Private opt-in player percentile source; no caller-supplied hosts or URLs."""

from fastapi import APIRouter, Depends, Query, Request

from fantasy_scraping.providers.datamb.parser import DataMBPlayer
from fantasy_scraping.scraper.errors import ScrapingError
from fantasy_scraping.security import require_service_token


class ProviderDisabledError(ScrapingError):
    """Explicitly disabled provider; never attempts network access."""

    category = "provider_disabled"
    status_code = 503
    detail = "DataMB provider is disabled"


router = APIRouter(prefix="/internal/radar", dependencies=[Depends(require_service_token)])


@router.get("/datamb", response_model=DataMBPlayer, tags=["internal"])
async def get_datamb_player(
    request: Request,
    profile_key: str = Query(pattern=r"^[A-Za-z0-9_-]{1,120}_stats[0-9]{0,3}$"),
    season: str = Query(pattern=r"^20\d{2}-\d{2}$"),
) -> DataMBPlayer:
    """Read an allowed DataMB player profile only when explicitly enabled."""
    if not request.app.state.settings.datamb_enabled:
        raise ProviderDisabledError()
    return await request.app.state.get_datamb_service().get_player(profile_key, season)
