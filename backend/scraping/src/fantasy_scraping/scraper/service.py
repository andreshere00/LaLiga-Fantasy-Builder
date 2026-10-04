"""Scraper orchestrator. No HTTP, parsing or FastAPI imports."""

import asyncio
import json
import logging
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from importlib import resources

from fantasy_scraping.models.page import PageKind, ScrapedPage
from fantasy_scraping.scraper.cache import PageCache, route_key
from fantasy_scraping.scraper.downloader import PageDownloader
from fantasy_scraping.scraper.errors import (
    AmbiguousPlayerError,
    InvalidRequestError,
    PlayerNotFoundError,
    ScrapingError,
    UnexpectedContentError,
)
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.link_data import LinkedDataProvider
from fantasy_scraping.scraper.models import (
    Candidate,
    LinkedData,
    PlayerRef,
    PlayerRoute,
    ScrapeOptions,
    ScrapeOutcome,
)
from fantasy_scraping.scraper.normalise import normalise
from fantasy_scraping.scraper.probes import competition_slugs, team_matches, team_slug, widget_id
from fantasy_scraping.scraper.resolver import RouteResolver
from fantasy_scraping.scraper.settings import ScraperSettings
from fantasy_scraping.scraper.urls import check_season, laliga_slug, player_url

LOGGER: logging.Logger = logging.getLogger(__name__)
MAX_BATCH: int = 25
TEAM_PROBES: int = 3
DEFAULT_INCLUDE: frozenset[PageKind] = frozenset({PageKind.PLAYER})


def load_aliases() -> dict[str, str]:
    """Read the committed ``aliases.json``."""
    text = resources.files("fantasy_scraping.scraper").joinpath("data/aliases.json").read_text()
    return json.loads(text)


def current_season(now: datetime | None = None) -> str:
    """Return the season key containing ``now`` (seasons start in July)."""
    now = now or datetime.now(UTC)
    start = now.year if now.month >= 7 else now.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


class ScraperService:
    """Resolves players to routes and downloads their pages."""

    def __init__(
        self,
        client: ScrapingHttpClient,
        cache: PageCache,
        settings: ScraperSettings,
        aliases: Mapping[str, str] | None = None,
    ) -> None:
        """Compose the repositories.

        Args:
            client: Guarded HTTP client.
            cache: Page cache.
            settings: Scraper settings.
            aliases: Optional alias table. Defaults to the committed file.
        """
        self._cache: PageCache = cache
        self._settings: ScraperSettings = settings
        self._links: LinkedDataProvider = LinkedDataProvider(client, cache, settings)
        self._pages: PageDownloader = PageDownloader(client, cache, settings)
        self._aliases: Mapping[str, str] = aliases if aliases is not None else load_aliases()
        self._resolver: tuple[datetime, RouteResolver] | None = None

    async def get_linked_data(self, *, refresh: bool = False) -> LinkedData:
        """Return the sitemap index.

        Args:
            refresh: Force a rebuild.

        Raises:
            LinkDataUnavailableError: No fresh or stale index exists.
        """
        return await self._links.get(refresh=refresh)

    async def resolve_player_route(
        self,
        player_name: str,
        team: str | None = None,
        *,
        season: str | None = None,
        player_id: str | None = None,
        full_name: str | None = None,
    ) -> PlayerRoute:
        """Resolve a nickname (and optional team) to one player page.

        Args:
            player_name: Catalog nickname.
            team: Free-text team name used only to settle ambiguity.
            season: Season key. Defaults to the current season.
            player_id: Master player id for the alias table. Never ``playerTeamId``.
            full_name: Optional secondary name.

        Returns:
            The resolved route.

        Raises:
            PlayerNotFoundError: No slug is close enough.
            AmbiguousPlayerError: Several players match and the team cannot settle it.
            InvalidRequestError: Bad name or season.
            ScrapingError: Index or team-probe download failed.
        """
        season = check_season(season or current_season())
        team_norm = normalise(team) if team else None
        key = route_key(season, player_id or normalise(player_name), team_norm)
        if hit := self._cache.get(key):
            return hit.value
        data = await self._links.get()
        if self._resolver is None or self._resolver[0] != data.fetched_at:
            self._resolver = (data.fetched_at, RouteResolver(data.player_slugs, self._aliases))
        resolution = await asyncio.to_thread(
            self._resolver[1].resolve, player_name, full_name=full_name, player_id=player_id
        )
        winner, verified = resolution.candidates[0], None
        if resolution.ambiguous:
            slugs = [c.slug for c in resolution.candidates]
            if not team_norm:
                raise AmbiguousPlayerError(slugs)
            winner = await self._verify_team(resolution.candidates[:TEAM_PROBES], team_norm, season)
            verified = True
            if winner is None:
                raise AmbiguousPlayerError(slugs)
        route = PlayerRoute(
            slug=winner.slug,
            url=player_url(winner.slug, laliga_slug(season)),
            distance=winner.distance,
            candidates=resolution.candidates,
            metric=winner.metric,
            team_verified=verified,
        )
        self._cache.set(key, route, self._settings.ttl_route_s)
        return route

    async def download_player_page(
        self,
        route: PlayerRoute,
        season: str,
        *,
        kind: PageKind = PageKind.PLAYER,
        target: str | None = None,
        options: ScrapeOptions | None = None,
    ) -> ScrapedPage:
        """Download one page for a resolved route.

        Args:
            route: Resolved route.
            season: Season key.
            kind: Page family.
            target: Competition season slug, or the numeric widget id for the market widget.
            options: Per-request options.

        Raises:
            InvalidRequestError: A competition or widget target is missing.
            ScrapingError: Any download failure.
        """
        if kind is not PageKind.PLAYER and not target:
            raise InvalidRequestError("target required")
        return await self._pages.download(
            kind,
            player_slug=route.slug,
            season=season,
            season_slug=target if kind is PageKind.COMPETITION else laliga_slug(season),
            widget_id=target if kind is PageKind.MARKET_WIDGET else None,
            options=options,
        )

    async def scrape_competition_pages(
        self, route: PlayerRoute, season: str, *, options: ScrapeOptions | None = None
    ) -> list[ScrapedPage]:
        """Download the club-competition pages listed on the current-season profile.

        Args:
            route: Resolved route.
            season: Season key.
            options: Per-request options.

        Returns:
            One page per competition. A 404 is skipped with a warning.
        """
        profile = await self.download_player_page(route, season, options=options)
        label = f"{season[:4]}/{season[5:]}"
        pages: list[ScrapedPage] = []
        for slug in competition_slugs(profile.html, label):
            try:
                pages.append(
                    await self.download_player_page(
                        route, season, kind=PageKind.COMPETITION, target=slug, options=options
                    )
                )
            except PlayerNotFoundError:
                LOGGER.warning("competition_page_missing slug=%s player=%s", slug, route.slug)
        return pages

    async def scrape_player(
        self,
        player_name: str,
        season: str | None = None,
        *,
        team: str | None = None,
        player_id: str | None = None,
        full_name: str | None = None,
        include: frozenset[PageKind] = DEFAULT_INCLUDE,
        options: ScrapeOptions | None = None,
    ) -> list[ScrapedPage]:
        """Resolve a player and download the requested page kinds.

        Args:
            player_name: Catalog nickname.
            season: Season key. Defaults to the current season.
            team: Free-text team name.
            player_id: Master player id.
            full_name: Optional secondary name.
            include: Page kinds to return, in the order player, market, competitions.
            options: Per-request options.

        Returns:
            The requested pages.

        Raises:
            ScrapingError: Resolution or download failed.
            UnexpectedContentError: The market widget id is missing from the profile.
        """
        season = check_season(season or current_season())
        route = await self.resolve_player_route(
            player_name, team, season=season, player_id=player_id, full_name=full_name
        )
        return await self._pages_for(route, season, include, options)

    async def scrape_players(
        self,
        refs: Sequence[PlayerRef],
        season: str | None = None,
        *,
        include: frozenset[PageKind] = DEFAULT_INCLUDE,
        options: ScrapeOptions | None = None,
    ) -> list[ScrapeOutcome]:
        """Scrape a batch; one failing player never cancels the others.

        Args:
            refs: At most 25 player references.
            season: Season key.
            include: Page kinds to return.
            options: Per-request options.

        Returns:
            One outcome per reference, in order.

        Raises:
            InvalidRequestError: The batch is larger than 25.
        """
        if len(refs) > MAX_BATCH:
            raise InvalidRequestError("batch too large")
        season = check_season(season or current_season())

        async def one(ref: PlayerRef) -> ScrapeOutcome:
            try:
                route = await self.resolve_player_route(
                    ref.name,
                    ref.team,
                    season=season,
                    player_id=ref.player_id,
                    full_name=ref.full_name,
                )
                pages = await self._pages_for(route, season, include, options)
            except ScrapingError as exc:
                return ScrapeOutcome(ref=ref, error={"error": exc.category, "detail": exc.message})
            return ScrapeOutcome(ref=ref, pages=pages, route=route)

        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(one(ref)) for ref in refs]
        return [task.result() for task in tasks]

    def invalidate(self, *, slug: str | None = None) -> int:
        """Drop cached entries, optionally only those whose key mentions ``slug``.

        Args:
            slug: Player slug, or None for everything.

        Returns:
            Number of deleted keys.
        """
        suffix = f":{slug}"
        return self._cache.delete_matching(lambda key: slug is None or key.endswith(suffix))

    async def _pages_for(
        self,
        route: PlayerRoute,
        season: str,
        include: frozenset[PageKind],
        options: ScrapeOptions | None,
    ) -> list[ScrapedPage]:
        """Download every requested kind for a route."""
        profile = await self.download_player_page(route, season, options=options)
        pages = [profile] if PageKind.PLAYER in include else []
        if PageKind.MARKET_WIDGET in include:
            if not (wid := widget_id(profile.html)):
                raise UnexpectedContentError()
            pages.append(
                await self.download_player_page(
                    route, season, kind=PageKind.MARKET_WIDGET, target=wid, options=options
                )
            )
        if PageKind.COMPETITION in include:
            pages.extend(await self.scrape_competition_pages(route, season, options=options))
        return pages

    async def _verify_team(
        self, candidates: list[Candidate], team_norm: str, season: str
    ) -> Candidate | None:
        """Return the first candidate whose profile links to the requested team."""
        for candidate in candidates:
            route = PlayerRoute(
                slug=candidate.slug, url="", distance=candidate.distance, metric=candidate.metric
            )
            page = await self.download_player_page(route, season)
            probed = team_slug(page.html)
            if probed is None:
                raise UnexpectedContentError()
            if team_matches(team_norm, probed):
                return candidate
        return None
