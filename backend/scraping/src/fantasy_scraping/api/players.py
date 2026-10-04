"""Private parsed-player endpoints."""

from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from fantasy_scraping.parser.service import ParserService
from fantasy_scraping.scraper.service import ScraperService
from fantasy_scraping.scraper.urls import check_season
from fantasy_scraping.security import require_service_token
from fantasy_scraping.services.player_document import PlayerDocumentService

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def _clean_query(value: str, field: str) -> str:
    text = _CONTROL.sub("", value.strip())
    if not text or len(text) > 80:
        raise HTTPException(status_code=422, detail=f"invalid {field}")
    return text


def get_scraper(request: Request) -> ScraperService:
    """Return the scraper service."""
    return request.app.state.get_service()


def get_player_document(
    scraper: Annotated[ScraperService, Depends(get_scraper)],
) -> PlayerDocumentService:
    """Wire the document service."""
    return PlayerDocumentService(scraper, ParserService())


ScraperDep = Annotated[ScraperService, Depends(get_scraper)]
DocumentDep = Annotated[PlayerDocumentService, Depends(get_player_document)]

router = APIRouter(
    prefix="/internal/players",
    dependencies=[Depends(require_service_token)],
)


@router.get("/futbolfantasy")
async def get_futbolfantasy_player(
    document: DocumentDep,
    player_name: Annotated[str, Query(min_length=1, max_length=80)],
    season: Annotated[str, Query(min_length=7, max_length=7)],
    team: Annotated[str | None, Query(max_length=80)] = None,
    player_id: Annotated[str | None, Query(max_length=10, pattern=r"^[0-9]+$")] = None,
    full_name: Annotated[str | None, Query(max_length=80)] = None,
) -> Any:
    """Scrape, parse, and merge one player for the given season."""
    name = _clean_query(player_name, "player_name")
    season_key = check_season(season)
    team_hint = _clean_query(team, "team") if team else None
    player = await document.futbolfantasy(
        name,
        season=season_key,
        team=team_hint,
        player_id=player_id,
        full_name=_clean_query(full_name, "full_name") if full_name else None,
    )
    return player.model_dump(mode="json", by_alias=True)
