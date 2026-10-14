"""Read-only lineup orchestration; pure CPU search runs off the event loop."""

import asyncio
import secrets
from datetime import UTC, datetime
from threading import Event
from uuid import uuid4

from fantasy_api.domain.errors import BuilderError, UpstreamError
from fantasy_api.domain.lineup_builder.search import search_candidates
from fantasy_api.repositories.lineup_builder import LineupBuilderRepository
from fantasy_api.schemas.lineup_builder import BuildPreferences, BuildResponse
from fantasy_api.services.lineup_builder_explanations import (
    DisabledExplanationProvider,
    ExplanationProvider,
)


class LineupBuilderService:
    """Bound source retrieval, concurrency and planning CPU work.

    Args:
        repository: Typed server-snapshot adapter.
    """

    def __init__(
        self, repository: LineupBuilderRepository, explanation: ExplanationProvider | None = None
    ) -> None:
        self._repository = repository
        self._active = 0
        self._explanation = explanation or DisabledExplanationProvider()

    async def build(self, jwt: str, league_id: str, preferences: BuildPreferences) -> BuildResponse:
        """Build recommendations without saving or executing transactions.

        Args:
            jwt: Verified caller token.
            league_id: Caller-scoped league.
            preferences: Validated source, mandatory-player and trade preferences.

        Returns:
            Deterministic candidate data and separate explanation status.
        """
        if self._active >= 2:
            raise UpstreamError("builder is busy", status_code=429, category="builder_busy")
        self._active += 1
        cancelled = Event()
        try:
            async with asyncio.timeout(120):
                now = datetime.now(UTC)
                snapshot = await self._repository.snapshot(jwt, league_id, preferences, now)
                missing = set(preferences.mandatory_player_ids) - {
                    p.player_id for p in snapshot.players
                }
                if missing:
                    raise BuilderError(
                        "mandatory players cannot qualify; review source diagnostics",
                        status_code=409,
                        category="mandatory_player_conflict",
                        diagnostics=[d.model_dump() for d in snapshot.diagnostics]
                        + [
                            {"code": "mandatory_not_eligible", "player_id": pid}
                            for pid in sorted(missing)
                        ],
                    )
                mandatory = [
                    p for p in snapshot.players if p.player_id in preferences.mandatory_player_ids
                ]
                if not any(
                    all(
                        sum(p.position == pos for p in mandatory) <= amount
                        for pos, amount in enumerate((1, *map(int, code.split(","))), 1)
                    )
                    for code in snapshot.formations
                ):
                    raise BuilderError(
                        "mandatory positions cannot fit selected formations",
                        status_code=409,
                        category="mandatory_player_conflict",
                        diagnostics=[],
                    )
                seed = secrets.randbits(32)
                candidates, complete, states = await asyncio.to_thread(
                    search_candidates,
                    snapshot.players,
                    snapshot.owned,
                    snapshot.cash,
                    preferences,
                    snapshot.formations,
                    snapshot.target,
                    now,
                    seed,
                    cancelled=cancelled,
                    reserved_squad_slots=snapshot.reserved_squad_slots,
                )
                if not candidates:
                    raise BuilderError(
                        "no feasible candidate" if complete else "search interrupted",
                        status_code=409 if complete else 503,
                        category="no_feasible_lineup" if complete else "search_incomplete",
                        diagnostics=[d.model_dump() for d in snapshot.diagnostics],
                    )
                result = BuildResponse(
                    build_id=str(uuid4()),
                    generated_at=now,
                    league_id=league_id,
                    team_id=snapshot.team_id,
                    target=snapshot.target,
                    random_seed=seed,
                    search_complete=complete,
                    search_limit_reason=None if complete else "search_budget",
                    evaluated_states=states,
                    evaluated_players=len(snapshot.players),
                    candidates=candidates,
                    diagnostics=snapshot.diagnostics,
                    explanation_status=(
                        "unavailable" if preferences.explanation.enabled else "disabled"
                    ),
                )
                if preferences.explanation.enabled:
                    prose = await self._explanation.explain(
                        result, preferences.explanation.reasoning_effort
                    )
                    result = result.model_copy(
                        update={
                            "explanations": prose,
                            "explanation_status": "complete" if prose else "unavailable",
                        }
                    )
                return result
        except TimeoutError:
            raise UpstreamError(
                "builder source deadline exceeded", status_code=503, category="builder_timeout"
            ) from None
        finally:
            cancelled.set()
            self._active -= 1

    async def aclose(self) -> None:
        """Close optional provider resources."""
        await self._explanation.aclose()
