"""Private ``/internal/scrape`` controller. Calls the service only."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from fantasy_scraping.models.page import PageKind
from fantasy_scraping.scraper.models import PlayerRef, PlayerRoute, ScrapeOptions, ScrapeOutcome
from fantasy_scraping.scraper.service import MAX_BATCH, ScraperService
from fantasy_scraping.security import require_service_token


class LinkedDataSummary(BaseModel):
    """Index counts; the 16k slugs are not returned."""

    players: int
    teams: int
    fetched_at: str


class ScrapePlayersRequest(BaseModel):
    """Batch request body."""

    model_config = ConfigDict(extra="forbid")

    players: list[PlayerRef] = Field(min_length=1, max_length=MAX_BATCH)
    season: str | None = None
    include: list[PageKind] = Field(default_factory=lambda: [PageKind.PLAYER])
    options: ScrapeOptions = Field(default_factory=ScrapeOptions)


class ScrapePlayersResponse(BaseModel):
    """Per-item outcomes; a failed player does not fail the batch."""

    results: list[ScrapeOutcome]


class ProbeRequest(BaseModel):
    """Developer selector probe body."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    team: str | None = Field(default=None, max_length=100)
    season: str | None = None
    extract_rules: dict[str, Annotated[str, Field(max_length=512)]] = Field(
        min_length=1, max_length=20
    )
    multiple: bool = True


class ProbeResponse(BaseModel):
    """Fragments per rule."""

    fragments: dict[str, list[str]]


class CacheStats(BaseModel):
    """Cache counters."""

    entries: int
    hits: int
    misses: int


class HealthDetail(BaseModel):
    """Operational status; no URLs, headers or secrets."""

    breaker: str
    index: str
    index_players: int
    index_age_s: float | None
    cache: CacheStats


class InvalidateRequest(BaseModel):
    """Cache invalidation body."""

    model_config = ConfigDict(extra="forbid")

    slug: str | None = None


class InvalidateResponse(BaseModel):
    """Number of dropped cache entries."""

    deleted: int


def get_service(request: Request) -> ScraperService:
    """Return the application's scraper service."""
    return request.app.state.get_service()


Service = Annotated[ScraperService, Depends(get_service)]
router = APIRouter(prefix="/internal/scrape", dependencies=[Depends(require_service_token)])
health_router = APIRouter(dependencies=[Depends(require_service_token)])


async def _summary(service: ScraperService, *, refresh: bool) -> LinkedDataSummary:
    """Build the index summary."""
    data = await service.get_linked_data(refresh=refresh)
    return LinkedDataSummary(
        players=len(data.player_slugs),
        teams=len(data.team_slugs),
        fetched_at=data.fetched_at.isoformat(),
    )


@router.get("/linked-data", response_model=LinkedDataSummary)
async def linked_data(service: Service, refresh: bool = False) -> LinkedDataSummary:
    """Return index counts, optionally rebuilding first."""
    return await _summary(service, refresh=refresh)


@router.post("/linked-data/refresh", response_model=LinkedDataSummary)
async def refresh_linked_data(service: Service) -> LinkedDataSummary:
    """Force an index rebuild."""
    return await _summary(service, refresh=True)


@router.get("/routes", response_model=PlayerRoute)
async def route(
    service: Service,
    name: Annotated[str, Query(min_length=1, max_length=100)],
    team: Annotated[str | None, Query(max_length=100)] = None,
    full_name: Annotated[str | None, Query(max_length=100)] = None,
    player_id: Annotated[str | None, Query(max_length=10, pattern=r"^[0-9]+$")] = None,
    season: str | None = None,
) -> PlayerRoute:
    """Resolve a name to a player route."""
    return await service.resolve_player_route(
        name, team, season=season, player_id=player_id, full_name=full_name
    )


@router.post("/players", response_model=ScrapePlayersResponse)
async def players(body: ScrapePlayersRequest, service: Service) -> ScrapePlayersResponse:
    """Scrape a batch of players."""
    results = await service.scrape_players(
        body.players, body.season, include=frozenset(body.include), options=body.options
    )
    return ScrapePlayersResponse(results=results)


@router.post("/cache/invalidate", response_model=InvalidateResponse)
async def invalidate(body: InvalidateRequest, service: Service) -> InvalidateResponse:
    """Drop cached entries."""
    return InvalidateResponse(deleted=service.invalidate(slug=body.slug))


@router.post("/probe", response_model=ProbeResponse)
async def probe(body: ProbeRequest, service: Service, request: Request) -> ProbeResponse:
    """Run CSS rules on a profile. Disabled unless ``DEBUG`` is true."""
    if not request.app.state.settings.debug:
        raise HTTPException(status_code=404, detail="not found")
    fragments = await service.probe(
        body.name,
        body.extract_rules,
        team=body.team,
        season=body.season,
        multiple=body.multiple,
    )
    return ProbeResponse(fragments=fragments)


@health_router.get("/internal/health", response_model=HealthDetail)
async def internal_health(service: Service) -> HealthDetail:
    """Return breaker, index and cache state."""
    return HealthDetail.model_validate(service.health())
