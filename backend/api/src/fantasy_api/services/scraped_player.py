"""Cache and bound concurrent FutbolFantasy scrapes."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from pydantic import ValidationError

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.season import Season
from fantasy_api.domain.ttl_cache import AsyncTtlCache
from fantasy_api.repositories.player_stats import PlayerStatsRepository
from fantasy_api.schemas.scraped import FutbolFantasyWire
from fantasy_api.services.player_resolver import ResolvedPlayer
from fantasy_api.services.wire_map import parse_wire_document

_NEGATIVE_TTL = 30.0
_NEGATIVE_CATEGORIES = frozenset(
    {"scraping_unavailable", "rate_limited", "upstream_timeout"},
)


@dataclass(frozen=True, slots=True)
class ScrapedDocument:
    """Parsed FutbolFantasy wire plus fetch metadata."""

    wire: FutbolFantasyWire
    fetched_at: float
    cached: bool


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
        self._negative: dict[str, tuple[float, UpstreamError]] = {}
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._lock = asyncio.Lock()

    async def futbolfantasy(
        self,
        player: ResolvedPlayer,
        season: Season,
    ) -> ScrapedDocument:
        """Return parsed FutbolFantasy JSON for one player and season."""
        key = f"{player.id}:{season.season_key}"
        now = time.monotonic()
        negative = self._negative.get(key)
        if negative is not None and now < negative[0]:
            raise negative[1]
        async with self._lock:
            bucket = self._cache.setdefault(key, AsyncTtlCache(self._ttl))
            cached = bucket.is_fresh()
        wire, fetched_at = await bucket.get_or_fetch(
            lambda: self._fetch(player, season, key),
        )
        return ScrapedDocument(wire=wire, fetched_at=fetched_at, cached=cached)

    async def _fetch(
        self,
        player: ResolvedPlayer,
        season: Season,
        key: str,
    ) -> tuple[FutbolFantasyWire, float]:
        name = player.nickname or player.name or player.id
        async with self._semaphore:
            try:
                raw = await self._repository.get_futbolfantasy(
                    name,
                    season.season_key,
                    player.team_name,
                )
            except UpstreamError as exc:
                if exc.category in _NEGATIVE_CATEGORIES:
                    self._negative[key] = (time.monotonic() + _NEGATIVE_TTL, exc)
                raise exc
        if not isinstance(raw, dict):
            raise UpstreamError("scraping error", status_code=502, category="scraping_error")
        try:
            wire = parse_wire_document(raw)
        except ValidationError as exc:
            raise UpstreamError(
                "scraping error",
                status_code=502,
                category="scraping_error",
            ) from exc
        return wire, time.time()
