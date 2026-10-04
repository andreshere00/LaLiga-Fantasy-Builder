"""Resolve catalog player ids to scrape targets."""

from __future__ import annotations

import time
from dataclasses import dataclass

from fantasy_api.api.payload import as_model_list
from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.domain.ttl_cache import AsyncTtlCache
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.schemas.players import CatalogPlayer


@dataclass(frozen=True, slots=True)
class ResolvedPlayer:
    """Catalog player used for scraping and responses."""

    id: str
    name: str | None
    nickname: str | None
    slug: str | None
    team_id: int | None
    team_name: str | None
    position_id: int | None
    fantasy_status: str | None
    last_stats: list[object] | None


class PlayerResolver:
    """Cached catalog index keyed by master player id."""

    def __init__(self, players: PlayersRepository, *, ttl_seconds: int) -> None:
        self._players = players
        self._ttl = ttl_seconds
        self._cache = AsyncTtlCache[dict[str, ResolvedPlayer]](ttl_seconds)
        self._stale_until = 0.0
        self._stale_index: dict[str, ResolvedPlayer] | None = None

    async def resolve(self, player_id: str) -> ResolvedPlayer:
        """Return a resolved player or raise ``NotFoundError``."""
        index = await self._load_index()
        player = index.get(player_id)
        if player is None:
            raise NotFoundError("player not found")
        return player

    async def laliga_club_ids(self) -> frozenset[int]:
        """Return distinct Fantasy team ids from the catalog."""
        index = await self._load_index()
        ids = {p.team_id for p in index.values() if p.team_id is not None}
        return frozenset(ids)

    async def _load_index(self) -> dict[str, ResolvedPlayer]:
        async def fetch() -> dict[str, ResolvedPlayer]:
            try:
                raw = await self._players.list_players()
                rows = as_model_list(raw, CatalogPlayer)
            except UpstreamError:
                if self._stale_index and time.monotonic() < self._stale_until:
                    return self._stale_index
                raise
            index: dict[str, ResolvedPlayer] = {}
            for row in rows:
                if row.id is None:
                    continue
                player_id = str(row.id)
                team_id_raw = row.teamId
                team_id = int(team_id_raw) if team_id_raw is not None else None
                team_name: str | None = None
                if isinstance(row.team, dict):
                    team_name = str(row.team.get("name") or "") or None
                index[player_id] = ResolvedPlayer(
                    id=player_id,
                    name=row.name,
                    nickname=row.nickname,
                    slug=row.slug or row.nickname,
                    team_id=team_id,
                    team_name=team_name,
                    position_id=int(row.positionId) if row.positionId is not None else None,
                    fantasy_status=row.playerStatus,
                    last_stats=row.lastStats,
                )
            self._stale_index = index
            self._stale_until = time.monotonic() + self._ttl * 4
            return index

        return await self._cache.get_or_fetch(fetch)
