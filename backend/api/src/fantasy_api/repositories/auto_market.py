"""PostgreSQL storage for armed auto-market rules, serialized per verified owner."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg

from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.repositories.application_database import ApplicationDatabase
from fantasy_api.schemas.auto_market import (
    AutoExecution,
    AutoExecutionsResponse,
    AutoRule,
    AutoRulesResponse,
    AutoRuleWrite,
)
from fantasy_api.services.auto_market_rules import percent_to_bps, threshold_amount

LIVE_STATES = ("armed", "listed", "executing")
RULE_COLUMNS = (
    "r.*, e.id AS e_id, e.action AS e_action, e.amount AS e_amount, "
    "e.outcome AS e_outcome, e.reason AS e_reason, e.created_at AS e_created_at"
)
LATEST_EXECUTION = (
    "LEFT JOIN LATERAL (SELECT * FROM auto_market_executions x WHERE x.rule_id=r.id "
    "ORDER BY x.id DESC LIMIT 1) e ON true"
)


def rule_from_row(row: Any) -> AutoRule:
    """Build the wire model, deriving the amount the rule waits for."""
    bps = row["trigger_bps"]
    last = None
    if row["e_id"] is not None:
        last = AutoExecution(
            id=row["e_id"],
            rule_id=row["id"],
            action=row["e_action"],
            amount=row["e_amount"],
            outcome=row["e_outcome"],
            reason=row["e_reason"],
            created_at=row["e_created_at"],
        )
    return AutoRule(
        id=row["id"],
        league_id=row["league_id"],
        side=row["side"],
        target=row["target"],
        player_id=row["player_id"],
        player_team_id=row["player_team_id"],
        player_name=row["player_name"],
        trigger_kind=row["trigger_kind"],
        trigger_percent=bps / 100 if bps is not None else None,
        trigger_amount=row["trigger_amount"],
        baseline_value=row["baseline_value"],
        threshold_amount=threshold_amount(
            row["side"],
            row["trigger_kind"],
            row["baseline_value"],
            bps=bps,
            amount=row["trigger_amount"],
        ),
        price_mode=row["price_mode"],
        bid_amount=row["bid_amount"],
        max_spend=row["max_spend"],
        list_now=row["list_now"],
        state=row["state"],
        armed_at=row["armed_at"],
        expires_at=row["expires_at"],
        listed_price=row["listed_price"],
        accept_floor=row["accept_floor"],
        listed_at=row["listed_at"],
        last_execution=last,
    )


@dataclass(frozen=True)
class LiveRule:
    """A rule the worker still owes work, with the version that guards its writes."""

    rule: AutoRule
    version: int
    claimed_at: datetime | None


class AutoMarketRepository(ApplicationDatabase):
    """Own the application pool; rules never fall back to volatile storage."""

    def __init__(self, database_url: str) -> None:
        super().__init__(database_url, "auto-market")

    @asynccontextmanager
    async def session(self, owner: str) -> AsyncIterator[AutoMarketSession]:
        """Serialize reads and mutations for this owner across processes."""
        await self.start()
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", owner)
            yield AutoMarketSession(conn, owner)

    async def due(self) -> list[tuple[str, str]]:
        """Return bounded due work; workers recheck under the owner lock."""
        await self.start()
        rows = await self._pool.fetch(
            "SELECT owner_id,league_id FROM auto_market_leagues "
            "WHERE status IN ('active','degraded') AND next_check <= now() "
            "ORDER BY next_check LIMIT 100"
        )
        return [(row["owner_id"], row["league_id"]) for row in rows]


class AutoMarketSession:
    """Repository operations scoped to one owner in an open transaction."""

    def __init__(self, conn: Any, owner: str) -> None:
        self.conn = conn
        self.owner = owner

    async def league(self, league: str) -> Any:
        """Read private worker state for this owner/league."""
        return await self.conn.fetchrow(
            "SELECT * FROM auto_market_leagues WHERE owner_id=$1 AND league_id=$2",
            self.owner,
            league,
        )

    async def rules(self, league: str) -> AutoRulesResponse:
        """Read this league's rules newest first with their latest attempt."""
        rows = await self.conn.fetch(
            f"SELECT {RULE_COLUMNS} FROM auto_market_rules r {LATEST_EXECUTION} "
            "WHERE r.owner_id=$1 AND r.league_id=$2 ORDER BY r.id DESC",
            self.owner,
            league,
        )
        state = await self.league(league)
        return AutoRulesResponse(
            rules=[rule_from_row(row) for row in rows],
            status=state["status"] if state else "inactive",
            checked_at=state["checked_at"] if state else None,
        )

    async def rule(self, league: str, rule_id: int) -> Any:
        """Read one owned rule row, or ``None``."""
        return await self.conn.fetchrow(
            f"SELECT {RULE_COLUMNS} FROM auto_market_rules r {LATEST_EXECUTION} "
            "WHERE r.owner_id=$1 AND r.league_id=$2 AND r.id=$3",
            self.owner,
            league,
            rule_id,
        )

    async def live_rules(self, league: str) -> list[LiveRule]:
        """Read rules the worker must still evaluate, oldest first."""
        rows = await self.conn.fetch(
            f"SELECT {RULE_COLUMNS} FROM auto_market_rules r {LATEST_EXECUTION} "
            "WHERE r.owner_id=$1 AND r.league_id=$2 AND r.state = ANY($3) ORDER BY r.id",
            self.owner,
            league,
            list(LIVE_STATES),
        )
        return [LiveRule(rule_from_row(r), r["version"], r["claimed_at"]) for r in rows]

    async def claim(self, rule_id: int, state: str, version: int) -> bool:
        """Win the right to attempt one write; losers of a race never write."""
        row = await self.conn.fetchrow(
            "UPDATE auto_market_rules SET state='executing',version=version+1,claimed_at=now() "
            "WHERE owner_id=$1 AND id=$2 AND state=$3 AND version=$4 RETURNING id",
            self.owner,
            rule_id,
            state,
            version,
        )
        return row is not None

    async def release(self, rule_id: int, state: str, version: int) -> None:
        """Hand a claim back when the write definitely did not happen."""
        await self.conn.execute(
            "UPDATE auto_market_rules SET state=$3,version=version+1,claimed_at=NULL "
            "WHERE owner_id=$1 AND id=$2 AND state='executing' AND version=$4",
            self.owner,
            rule_id,
            state,
            version,
        )

    async def finish(
        self,
        rule_id: int,
        version: int,
        state: str,
        action: str,
        outcome: str,
        *,
        amount: int | None = None,
        reason: str | None = None,
        listed_price: int | None = None,
        accept_floor: int | None = None,
    ) -> None:
        """Record an attempt and move the rule to its next state in one transaction."""
        await self.conn.execute(
            "UPDATE auto_market_rules SET state=$3,version=version+1,claimed_at=NULL,"
            "listed_price=COALESCE($5,listed_price),accept_floor=COALESCE($6,accept_floor),"
            "listed_at=CASE WHEN $5::bigint IS NULL THEN listed_at ELSE now() END "
            "WHERE owner_id=$1 AND id=$2 AND version=$4",
            self.owner,
            rule_id,
            state,
            version,
            listed_price,
            accept_floor,
        )
        await self.note(rule_id, version, action, outcome, amount=amount, reason=reason)

    async def note(
        self,
        rule_id: int,
        version: int,
        action: str,
        outcome: str,
        *,
        amount: int | None = None,
        reason: str | None = None,
    ) -> None:
        """Record one attempt once per rule version, action and reason."""
        await self.conn.execute(
            "INSERT INTO auto_market_executions(rule_id,owner_id,action,amount,outcome,reason,"
            "idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
            rule_id,
            self.owner,
            action,
            amount,
            outcome,
            reason,
            f"{rule_id}:{version}:{action}:{outcome}:{reason}",
        )

    async def health(self, league: str, status: str, next_check: datetime, success: bool) -> None:
        """Store the pass outcome and schedule the next one."""
        await self.conn.execute(
            "UPDATE auto_market_leagues SET status=$3,next_check=$4,"
            "checked_at=CASE WHEN $5 THEN now() ELSE checked_at END,"
            "failures=CASE WHEN $5 THEN 0 ELSE failures+1 END "
            "WHERE owner_id=$1 AND league_id=$2",
            self.owner,
            league,
            status,
            next_check,
            success,
        )

    async def arm(
        self,
        league: str,
        league_name: str,
        grant: str,
        write: AutoRuleWrite,
        player_name: str,
        baseline: int,
    ) -> int:
        """Store a new armed rule and wake the league's worker pass."""
        await self._activate(league, league_name, grant)
        try:
            return await self.conn.fetchval(
                "INSERT INTO auto_market_rules(owner_id,league_id,side,target,player_id,"
                "player_team_id,player_name,trigger_kind,trigger_bps,trigger_amount,"
                "baseline_value,price_mode,bid_amount,max_spend,expires_at,list_now) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id",
                self.owner,
                league,
                write.side,
                write.target,
                write.player_id,
                write.player_team_id,
                player_name,
                write.trigger_kind,
                percent_to_bps(write.trigger_percent) if write.trigger_percent else None,
                write.trigger_amount,
                baseline,
                write.price_mode,
                write.bid_amount,
                write.max_spend,
                write.expires_at,
                write.lists_now,
            )
        except asyncpg.UniqueViolationError as exc:
            raise UpstreamError(
                "an active rule already exists for this player",
                status_code=409,
                category="rule_exists",
            ) from exc

    async def replace(
        self,
        league: str,
        rule_id: int,
        write: AutoRuleWrite,
        player_name: str,
        baseline: int,
    ) -> None:
        """Replace an armed rule and re-baseline it; listed or running rules are final."""
        try:
            updated = await self.conn.fetchval(
                "UPDATE auto_market_rules SET side=$4,target=$5,player_id=$6,player_team_id=$7,"
                "player_name=$8,trigger_kind=$9,trigger_bps=$10,trigger_amount=$11,"
                "baseline_value=$12,price_mode=$13,bid_amount=$14,max_spend=$15,expires_at=$16,"
                "list_now=$17,version=version+1,armed_at=now() "
                "WHERE owner_id=$1 AND league_id=$2 AND id=$3 AND state='armed' RETURNING id",
                self.owner,
                league,
                rule_id,
                write.side,
                write.target,
                write.player_id,
                write.player_team_id,
                player_name,
                write.trigger_kind,
                percent_to_bps(write.trigger_percent) if write.trigger_percent else None,
                write.trigger_amount,
                baseline,
                write.price_mode,
                write.bid_amount,
                write.max_spend,
                write.expires_at,
                write.lists_now,
            )
        except asyncpg.UniqueViolationError as exc:
            raise UpstreamError(
                "an active rule already exists for this player",
                status_code=409,
                category="rule_exists",
            ) from exc
        if updated is None:
            raise NotFoundError("armed rule not found")

    async def resume(self, league: str, grant: str) -> None:
        """Store a fresh grant and wake a league paused for reconnection or membership."""
        await self.conn.execute(
            "UPDATE auto_market_leagues SET grant_id=$3,"
            "status=CASE WHEN status IN ('needs_reauth','not_member') "
            "THEN 'active' ELSE status END,"
            "next_check=CASE WHEN status IN ('needs_reauth','not_member') THEN now() "
            "ELSE next_check END,"
            "failures=CASE WHEN status IN ('needs_reauth','not_member') THEN 0 ELSE failures END "
            "WHERE owner_id=$1 AND league_id=$2 AND status <> 'inactive'",
            self.owner,
            league,
            grant,
        )

    async def cancel(self, league: str, rule_id: int) -> bool:
        """Cancel a live rule; return whether the league has no live rules left."""
        cancelled = await self.conn.fetchval(
            "UPDATE auto_market_rules SET state='cancelled',version=version+1 "
            "WHERE owner_id=$1 AND league_id=$2 AND id=$3 AND state IN ('armed','listed') "
            "RETURNING id",
            self.owner,
            league,
            rule_id,
        )
        if cancelled is None:
            raise NotFoundError("live rule not found")
        return await self.deactivate_if_idle(league)

    async def deactivate_if_idle(self, league: str) -> bool:
        """Pause the league when no live rule remains, clearing its grant reference."""
        row = await self.conn.fetchrow(
            "UPDATE auto_market_leagues l SET status='inactive',grant_id=NULL "
            "WHERE owner_id=$1 AND league_id=$2 AND status <> 'inactive' AND NOT EXISTS "
            "(SELECT 1 FROM auto_market_rules r WHERE r.owner_id=l.owner_id "
            "AND r.league_id=l.league_id AND r.state = ANY($3)) RETURNING league_id",
            self.owner,
            league,
            list(LIVE_STATES),
        )
        return row is not None

    async def executions(self, league: str, limit: int) -> AutoExecutionsResponse:
        """Read the newest attempts for this league."""
        rows = await self.conn.fetch(
            "SELECT x.* FROM auto_market_executions x JOIN auto_market_rules r ON r.id=x.rule_id "
            "WHERE r.owner_id=$1 AND r.league_id=$2 ORDER BY x.id DESC LIMIT $3",
            self.owner,
            league,
            limit,
        )
        return AutoExecutionsResponse(
            executions=[
                AutoExecution(
                    id=row["id"],
                    rule_id=row["rule_id"],
                    action=row["action"],
                    amount=row["amount"],
                    outcome=row["outcome"],
                    reason=row["reason"],
                    created_at=row["created_at"],
                )
                for row in rows
            ]
        )

    async def leagues(self) -> list[str]:
        """List every league that still holds a grant for this owner."""
        rows = await self.conn.fetch(
            "SELECT league_id FROM auto_market_leagues WHERE owner_id=$1 AND grant_id IS NOT NULL",
            self.owner,
        )
        return [row["league_id"] for row in rows]

    async def delete_account(self) -> None:
        """Erase this owner's rules and attempt history."""
        await self.conn.execute("DELETE FROM auto_market_leagues WHERE owner_id=$1", self.owner)

    async def _activate(self, league: str, name: str, grant: str) -> None:
        """Create or resume the league row and schedule an immediate pass."""
        await self.conn.execute(
            "INSERT INTO auto_market_leagues(owner_id,league_id,league_name,grant_id) "
            "VALUES ($1,$2,$3,$4) ON CONFLICT(owner_id,league_id) DO UPDATE SET "
            "league_name=$3,grant_id=$4,status='active',next_check=now(),failures=0",
            self.owner,
            league,
            name,
            grant,
        )
