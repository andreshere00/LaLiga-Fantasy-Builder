"""Catalog, fixtures, and scraping reads for one real club."""

from __future__ import annotations

from pydantic import ValidationError

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.ttl_cache import AsyncTtlCache
from fantasy_api.repositories.paths import segment
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.schemas.clubs import ScrapedClubNews, ScrapedClubPage
from fantasy_api.schemas.fixture_standings import SeasonFixture
from fantasy_api.schemas.payload import as_object_list
from fantasy_api.schemas.players import CatalogPlayer
from fantasy_api.schemas.stats_provider import TeamsMasterRow
from fantasy_api.services.fixture_standings import FixtureStandingsService


class ClubsRepository:
    """Read the public catalog and the private club dossier.

    Args:
        fantasy: Public Fantasy client.
        scraping: Private scraping client.
        fixtures: Cached season fixtures and teams-master directory.
        competition_id: Fantasy competition id.
        catalog_ttl_seconds: Freshness window of the cached public player catalog.
    """

    def __init__(
        self,
        fantasy: LaligaFantasyClient,
        scraping: ScrapingClient,
        fixtures: FixtureStandingsService,
        *,
        competition_id: int,
        catalog_ttl_seconds: int = 900,
    ) -> None:
        self._players = PlayersRepository(fantasy, competition_id=competition_id)
        self._scraping = scraping
        self._fixtures = fixtures
        self._catalog = AsyncTtlCache[list[CatalogPlayer]](catalog_ttl_seconds)

    async def clubs(self) -> list[TeamsMasterRow]:
        """Return the public teams-master directory."""
        return await self._fixtures.get_clubs()

    async def fixtures(self) -> list[SeasonFixture]:
        """Return cached season fixtures, including unfinished matches."""
        return await self._fixtures.get_season_fixtures()

    async def catalog(self) -> list[CatalogPlayer]:
        """Return the public player catalog, cached so one page view reads it once.

        Raises:
            UpstreamError: The catalog is not a list of player objects.
        """
        return await self._catalog.get_or_fetch(self._load_catalog)

    async def _load_catalog(self) -> list[CatalogPlayer]:
        """Read and validate the catalog from Fantasy."""
        try:
            rows = as_object_list(await self._players.list_players())
            return [CatalogPlayer.model_validate(row) for row in rows]
        except (ValidationError, ValueError) as exc:
            raise UpstreamError(
                "player catalog was unavailable",
                status_code=502,
                category="upstream_error",
            ) from exc

    async def club_page(self, slug: str) -> ScrapedClubPage:
        """Return the parsed club page.

        Raises:
            UpstreamError: The scraping call failed or the JSON was unexpected.
        """
        return _validate(
            await self._scraping.get_json(f"/internal/clubs/{segment(slug)}", {}),
            ScrapedClubPage,
        )

    async def club_news(self, slug: str) -> ScrapedClubNews:
        """Return the parsed club changelog.

        Raises:
            UpstreamError: The scraping call failed or the JSON was unexpected.
        """
        return _validate(
            await self._scraping.get_json(f"/internal/clubs/{segment(slug)}/news", {}),
            ScrapedClubNews,
        )


def _validate[T: ScrapedClubPage | ScrapedClubNews](raw: object, model: type[T]) -> T:
    """Validate one scraping document without returning its raw body."""
    if not isinstance(raw, dict):
        raise UpstreamError(
            "club dossier was unavailable",
            status_code=502,
            category="upstream_error",
        )
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        raise UpstreamError(
            "club dossier was unavailable",
            status_code=502,
            category="upstream_error",
        ) from exc
