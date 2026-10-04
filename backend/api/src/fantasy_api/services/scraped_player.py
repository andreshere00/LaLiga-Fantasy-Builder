"""Cache and bound concurrent FutbolFantasy scrapes."""

from __future__ import annotations

import asyncio
import time

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.season import Season
from fantasy_api.domain.ttl_cache import AsyncTtlCache
from fantasy_api.repositories.player_stats import PlayerStatsRepository
from fantasy_api.schemas.scraped import FutbolFantasyWire
from fantasy_api.services.player_resolver import ResolvedPlayer
from fantasy_api.services.wire_map import parse_wire_document

_NEGATIVE_TTL = 30.0


class ScrapedPlayerProvider:
    """Single-flight cache for parsed FutbolFantasy documents."""

    def __init__(
        self,
        repository: PlayerStatsRepository,
        *,
        ttl_seconds: int,
        max_concurrency: int,
    ) -> None:
        self._repository = repository
        self._ttl = ttl_seconds
        self._cache: dict[str, AsyncTtlCache[tuple[FutbolFantasyWire, float]]] = {}
        self._negative: dict[str, float] = {}
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._lock = asyncio.Lock()

    async def futbolfantasy(
        self,
        player: ResolvedPlayer,
        season: Season,
    ) -> FutbolFantasyWire:
        """Return parsed FutbolFantasy JSON for one player and season."""
        key = f"{player.id}:{season.futbolfantasy_slug}"
        now = time.monotonic()
        negative_until = self._negative.get(key)
        if negative_until is not None and now < negative_until:
            raise UpstreamError(
                "scraping unavailable",
                status_code=503,
                category="scraping_unavailable",
            )
        async with self._lock:
            bucket = self._cache.setdefault(key, AsyncTtlCache(self._ttl))
        async with self._semaphore:
            wire, fetched_at = await bucket.get_or_fetch(
                lambda: self._fetch(player, season),
            )
        return wire

    async def _fetch(
        self,
        player: ResolvedPlayer,
        season: Season,
    ) -> tuple[FutbolFantasyWire, float]:
        name = player.nickname or player.name or player.id
        try:
            raw = await self._repository.get_futbolfantasy(
                name,
                season.futbolfantasy_slug,
                player.team_name,
            )
            wire = parse_wire_document(raw if isinstance(raw, dict) else {})
            return wire, time.time()
        except UpstreamError as exc:
            self._negative[f"{player.id}:{season.futbolfantasy_slug}"] = (
                time.monotonic() + _NEGATIVE_TTL
            )
            raise exc
