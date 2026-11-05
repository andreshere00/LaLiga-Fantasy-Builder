"""PostgreSQL application storage, serialized per verified owner across processes."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import asyncpg

from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.schemas.scouting import (
    Favorite,
    FavoritesResponse,
    InboxResponse,
    Observation,
    ScoutingNotification,
    WatchWrite,
)


class ScoutingRepository:
    """Own a separate application pool; never fall back to volatile storage."""

    def __init__(self, database_url: str) -> None:
        self._url = database_url
        self._pool: Any = None
        self._init_lock = asyncio.Lock()

    async def start(self) -> None:
        """Connect and apply ordered migrations under a database lock."""
        if self._pool is not None:
            return
        if not self._url:
            raise UpstreamError("scouting storage is not configured", status_code=503)
        async with self._init_lock:
            if self._pool is not None:
                return
            try:
                pool = await asyncpg.create_pool(self._url, min_size=1, max_size=5)
            except (OSError, asyncpg.PostgresError) as exc:
                raise UpstreamError("scouting storage unavailable", status_code=503) from exc
            try:
                async with pool.acquire() as conn, conn.transaction():
                    await conn.execute("SELECT pg_advisory_xact_lock(18271301)")
                    await conn.execute(
                        "CREATE TABLE IF NOT EXISTS schema_migrations "
                        "(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"
                    )
                    for path in sorted((Path(__file__).parents[1] / "migrations").glob("*.sql")):
                        if not await conn.fetchval(
                            "SELECT 1 FROM schema_migrations WHERE version=$1", path.name
                        ):
                            await conn.execute(path.read_text())
                            await conn.execute(
                                "INSERT INTO schema_migrations(version) VALUES ($1)", path.name
                            )
            except BaseException:
                await pool.close()
                raise
            self._pool = pool

    async def aclose(self) -> None:
        """Close application connections."""
        if self._pool is not None:
            await self._pool.close()

    @asynccontextmanager
    async def session(self, owner: str) -> AsyncIterator[ScoutingSession]:
        """Serialize reads, mutations and event commits for this owner."""
        await self.start()
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", owner)
            yield ScoutingSession(conn, owner)

    async def ready(self) -> None:
        """Check the application database without returning connection details."""
        await self.start()
        try:
            await self._pool.fetchval("SELECT 1")
        except (OSError, asyncpg.PostgresError) as exc:
            raise UpstreamError("scouting storage unavailable", status_code=503) from exc

    async def metrics(self) -> dict[str, object]:
        """Return aggregate lag, paused-watch count and latest successful check."""
        await self.start()
        row = await self._pool.fetchrow(
            "SELECT count(*) FILTER (WHERE status IN ('needs_reauth','not_member')) AS paused, "
            "COALESCE(EXTRACT(EPOCH FROM now()-min(next_check) FILTER "
            "(WHERE status IN ('active','degraded'))),0) AS lag_seconds, "
            "max(checked_at) AS last_success FROM scouting_leagues"
        )
        return {
            "paused": row["paused"],
            "lag_seconds": max(0, float(row["lag_seconds"])),
            "last_success": row["last_success"].isoformat() if row["last_success"] else None,
        }

    async def due(self) -> list[tuple[str, str]]:
        """Return bounded due work; workers recheck under the owner lock."""
        await self.start()
        rows = await self._pool.fetch(
            "SELECT owner_id,league_id FROM scouting_leagues "
            "WHERE status IN ('active','degraded') AND next_check <= now() "
            "ORDER BY next_check LIMIT 100"
        )
        return [(row["owner_id"], row["league_id"]) for row in rows]


class ScoutingSession:
    """Repository operations scoped to one owner in an open transaction."""

    def __init__(self, conn: Any, owner: str) -> None:
        self.conn = conn
        self.owner = owner

    async def favorites(self, league: str | None) -> FavoritesResponse:
        """Read global favorites and only this league's observations/preferences."""
        rows = await self.conn.fetch(
            "SELECT f.*,w.market_alert,w.clause_alert,w.lead_hours,w.observation "
            "FROM scouting_favorites f LEFT JOIN scouting_watches w "
            "ON f.owner_id=w.owner_id AND f.player_id=w.player_id AND w.league_id=$2 "
            "WHERE f.owner_id=$1 ORDER BY f.created_at DESC,f.player_id",
            self.owner,
            league,
        )
        state = await self.league(league) if league else None
        return FavoritesResponse(
            favorites=[
                Favorite(
                    player_id=row["player_id"],
                    created_at=row["created_at"],
                    watch=(
                        WatchWrite(
                            **{
                                key: row[key]
                                for key in ("market_alert", "clause_alert", "lead_hours")
                            }
                        )
                        if row["lead_hours"] is not None
                        else None
                    ),
                    observation=(
                        Observation.model_validate_json(row["observation"])
                        if row["observation"]
                        else None
                    ),
                )
                for row in rows
            ],
            status=state["status"] if state else "inactive",
            checked_at=state["checked_at"] if state else None,
        )

    async def add(self, ids: list[str]) -> None:
        """Union favorites without changing creation dates or watch preferences."""
        await self.conn.executemany(
            "INSERT INTO scouting_favorites(owner_id,player_id) VALUES ($1,$2) "
            "ON CONFLICT DO NOTHING",
            [(self.owner, pid) for pid in set(ids)],
        )

    async def remove(self, player: str) -> list[str]:
        """Delete a favorite and its watches, returning now-unused league grants."""
        await self.conn.execute(
            "DELETE FROM scouting_favorites WHERE owner_id=$1 AND player_id=$2", self.owner, player
        )
        return await self.inactive_leagues()

    async def inactive_leagues(self) -> list[str]:
        """Deactivate monitoring with no remaining enabled watches."""
        rows = await self.conn.fetch(
            "UPDATE scouting_leagues l SET status='inactive',grant_id=NULL "
            "WHERE owner_id=$1 AND status <> 'inactive' AND NOT EXISTS "
            "(SELECT 1 FROM scouting_watches w WHERE w.owner_id=l.owner_id "
            "AND w.league_id=l.league_id AND (w.market_alert OR w.clause_alert)) "
            "RETURNING league_id",
            self.owner,
        )
        return [row["league_id"] for row in rows]

    async def league(self, league: str) -> Any:
        """Read private monitoring state for this owner/league."""
        return await self.conn.fetchrow(
            "SELECT * FROM scouting_leagues WHERE owner_id=$1 AND league_id=$2", self.owner, league
        )

    async def watches(self, league: str) -> list[Any]:
        """Read enabled watches for one league."""
        return await self.conn.fetch(
            "SELECT * FROM scouting_watches WHERE owner_id=$1 AND league_id=$2 "
            "AND (market_alert OR clause_alert)",
            self.owner,
            league,
        )

    async def watch(
        self,
        league: str,
        player: str,
        prefs: WatchWrite,
        name: str,
        grant: str | None,
    ) -> None:
        """Replace preferences only for an existing favorite."""
        exists = await self.conn.fetchval(
            "SELECT 1 FROM scouting_favorites WHERE owner_id=$1 AND player_id=$2",
            self.owner,
            player,
        )
        if not exists:
            raise NotFoundError("favorite not found")
        await self.conn.execute(
            "INSERT INTO scouting_leagues(owner_id,league_id,league_name,grant_id) "
            "VALUES ($1,$2,$3,$4) ON CONFLICT(owner_id,league_id) DO UPDATE SET "
            "league_name=$3,grant_id=COALESCE($4,scouting_leagues.grant_id),"
            "status='active',next_check=CASE WHEN scouting_leagues.status "
            "IN ('active','degraded') THEN scouting_leagues.next_check ELSE now() END,failures=0",
            self.owner,
            league,
            name,
            grant,
        )
        await self.conn.execute(
            "INSERT INTO scouting_watches(owner_id,league_id,player_id,market_alert,clause_alert,"
            "lead_hours) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,league_id,player_id) "
            "DO UPDATE SET market_alert=$4,clause_alert=$5,lead_hours=$6",
            self.owner,
            league,
            player,
            prefs.market_alert,
            prefs.clause_alert,
            prefs.lead_hours,
        )

    async def observe(
        self,
        league: str,
        player: str,
        observation: Observation,
        events: list[tuple[str, str]],
        league_name: str,
    ) -> None:
        """Persist observation and uniquely keyed events in the same transaction."""
        await self.conn.execute(
            "UPDATE scouting_watches SET observation=$4::jsonb "
            "WHERE owner_id=$1 AND league_id=$2 AND player_id=$3",
            self.owner,
            league,
            player,
            observation.model_dump_json(),
        )
        for kind, key in events:
            await self.conn.execute(
                "INSERT INTO scouting_notifications(owner_id,league_id,league_name,player_id,"
                "player_name,kind,event_key) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
                self.owner,
                league,
                league_name,
                player,
                observation.name,
                kind,
                key,
            )

    async def health(self, league: str, status: str, next_check: Any, success: bool) -> None:
        """Record scheduling/health without erasing observations after failed reads."""
        await self.conn.execute(
            "UPDATE scouting_leagues SET status=$3,next_check=$4,"
            "checked_at=CASE WHEN $5 THEN now() ELSE checked_at END,"
            "failures=CASE WHEN $5 THEN 0 ELSE failures+1 END WHERE owner_id=$1 AND league_id=$2",
            self.owner,
            league,
            status,
            next_check,
            success,
        )

    async def inbox(self, league: str | None, cursor: int | None, limit: int) -> InboxResponse:
        """Page notifications without marking them read; count all unread events."""
        rows = await self.conn.fetch(
            "SELECT * FROM scouting_notifications WHERE owner_id=$1 AND ($2::text IS NULL "
            "OR league_id=$2) AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT $4",
            self.owner,
            league,
            cursor,
            limit + 1,
        )
        unread = await self.conn.fetchval(
            "SELECT count(*) FROM scouting_notifications WHERE owner_id=$1 AND read_at IS NULL",
            self.owner,
        )
        return InboxResponse(
            notifications=[
                ScoutingNotification(
                    **{
                        key: str(row[key]) if key == "id" else row[key]
                        for key in ScoutingNotification.model_fields
                    }
                )
                for row in rows[:limit]
            ],
            unread_count=unread,
            next_cursor=str(rows[limit - 1]["id"]) if len(rows) > limit else None,
        )

    async def read(self, notification: int) -> None:
        """Mark only an owned event read, idempotently."""
        row = await self.conn.fetchval(
            "UPDATE scouting_notifications SET read_at=COALESCE(read_at,now()) "
            "WHERE owner_id=$1 AND id=$2 RETURNING id",
            self.owner,
            notification,
        )
        if row is None:
            raise NotFoundError("notification not found")

    async def leagues(self) -> list[str]:
        """Return owned league IDs for revoking delegations during account deletion."""
        return [
            row["league_id"]
            for row in await self.conn.fetch(
                "SELECT league_id FROM scouting_leagues WHERE owner_id=$1", self.owner
            )
        ]

    async def delete_account(self) -> None:
        """Delete every application-owned scouting record for the verified subject."""
        for table in ("scouting_notifications", "scouting_leagues", "scouting_favorites"):
            await self.conn.execute(f"DELETE FROM {table} WHERE owner_id=$1", self.owner)
