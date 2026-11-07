"""Private parsed club-page endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from fantasy_scraping.parser.models.club_page import ClubNewsDocument, ClubPageDocument
from fantasy_scraping.scraper.service import ScraperService
from fantasy_scraping.scraper.urls import check_slug
from fantasy_scraping.security import require_service_token
from fantasy_scraping.services.club_document import ClubDocumentService


def get_scraper(request: Request) -> ScraperService:
    """Return the scraper service."""
    return request.app.state.get_service()


def get_club_document(
    scraper: Annotated[ScraperService, Depends(get_scraper)],
) -> ClubDocumentService:
    """Wire the club document service."""
    return ClubDocumentService(scraper)


DocumentDep = Annotated[ClubDocumentService, Depends(get_club_document)]

router = APIRouter(prefix="/internal/clubs", dependencies=[Depends(require_service_token)])


@router.get("/{slug}/news", response_model=ClubNewsDocument)
async def get_club_news(slug: str, document: DocumentDep) -> ClubNewsDocument:
    """Scrape and parse the five newest club changelog headlines."""
    return await document.news(check_slug(slug))


@router.get("/{slug}", response_model=ClubPageDocument)
async def get_club_page(slug: str, document: DocumentDep) -> ClubPageDocument:
    """Scrape and parse one club page."""
    return await document.page(check_slug(slug))
