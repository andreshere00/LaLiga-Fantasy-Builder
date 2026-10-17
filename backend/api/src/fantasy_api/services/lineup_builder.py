"""Read-only lineup orchestration; pure CPU search runs off the event loop."""

import asyncio
import secrets
from collections.abc import AsyncIterator
from contextlib import suppress
from datetime import UTC, datetime
from threading import Event
from uuid import uuid4

from fantasy_api.domain.errors import (
    BuilderError,
    NeedsReauthError,
    NotFoundError,
    UnauthorizedError,
    UpstreamError,
)
from fantasy_api.domain.lineup_builder.progress import ProgressCallback
from fantasy_api.domain.lineup_builder.search import search_candidates
from fantasy_api.repositories.lineup_builder import LineupBuilderRepository
from fantasy_api.schemas.lineup_builder import (
    BuildErrorEvent,
    BuildPreferences,
    BuildProgress,
    BuildProgressEvent,
    BuildResponse,
    BuildResultEvent,
    BuildStreamEvent,
)
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

    async def build(
        self,
        jwt: str,
        league_id: str,
        preferences: BuildPreferences,
        *,
        on_progress: ProgressCallback | None = None,
    ) -> BuildResponse:
        """Build recommendations without saving or executing transactions.

        Args:
            jwt: Verified caller token.
            league_id: Caller-scoped league.
            preferences: Validated source, mandatory-player and trade preferences.
            on_progress: Optional observer; percentages estimate stage-weighted work.

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
                if on_progress is not None:
                    on_progress(BuildProgress(stage="sources", percent=0))
                snapshot = await self._repository.snapshot(
                    jwt, league_id, preferences, now, on_progress=on_progress
                )
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
                if on_progress is not None:
                    on_progress(BuildProgress(stage="search", percent=85))
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
                    if on_progress is not None:
                        on_progress(BuildProgress(stage="explanation", percent=95))
                    prose = await self._explanation.explain(
                        result, preferences.explanation.reasoning_effort
                    )
                    result = result.model_copy(
                        update={
                            "explanations": prose,
                            "explanation_status": "complete" if prose else "unavailable",
                        }
                    )
                if on_progress is not None:
                    on_progress(BuildProgress(stage="complete", percent=100))
                return result
        except TimeoutError:
            raise UpstreamError(
                "builder source deadline exceeded", status_code=503, category="builder_timeout"
            ) from None
        finally:
            cancelled.set()
            self._active -= 1

    async def stream(
        self, jwt: str, league_id: str, preferences: BuildPreferences
    ) -> AsyncIterator[BuildStreamEvent]:
        """Yield bounded progress and one terminal event for this authenticated request.

        Args:
            jwt: Verified internal caller token.
            league_id: Caller-scoped league, authorized by the snapshot repository.
            preferences: Validated read-only build options.

        Yields:
            Latest progress followed by a result or sanitized error. Closing the
            iterator cancels source reads and signals CPU search cancellation.
        """
        queue: asyncio.Queue[BuildStreamEvent] = asyncio.Queue(maxsize=1)

        def report(progress: BuildProgress) -> None:
            """Coalesce pending updates so slow clients cannot accumulate work."""
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(BuildStreamEvent(BuildProgressEvent(progress=progress)))

        async def produce() -> None:
            """Convert build failures into bounded, secret-free terminal events."""
            try:
                result = await self.build(jwt, league_id, preferences, on_progress=report)
                event = BuildStreamEvent(BuildResultEvent(result=result))
            except UpstreamError as exc:
                status = exc.status_code or 502
                event = BuildStreamEvent(
                    BuildErrorEvent(
                        status=status if 400 <= status < 600 else 502,
                        error=exc.category,
                        diagnostics=exc.diagnostics if isinstance(exc, BuilderError) else [],
                    )
                )
            except (NeedsReauthError, UnauthorizedError, NotFoundError) as exc:
                event = BuildStreamEvent(
                    BuildErrorEvent(
                        status=404 if isinstance(exc, NotFoundError) else 401,
                        error=(
                            "not_found"
                            if isinstance(exc, NotFoundError)
                            else (
                                "needs_reauth"
                                if isinstance(exc, NeedsReauthError)
                                else "unauthorized"
                            )
                        ),
                    )
                )
            except Exception:
                # Never serialize exception messages or raw provider responses.
                event = BuildStreamEvent(BuildErrorEvent(status=500, error="builder_failed"))
            await queue.put(event)

        task = asyncio.create_task(produce())
        try:
            while True:
                event = await queue.get()
                yield event
                if not isinstance(event.root, BuildProgressEvent):
                    break
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    async def aclose(self) -> None:
        """Close optional provider resources."""
        await self._explanation.aclose()
