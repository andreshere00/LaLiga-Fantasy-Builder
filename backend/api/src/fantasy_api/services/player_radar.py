"""Build ordered role radars and enforce dataset compatibility on the server."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.radar.profiles import PROFILES
from fantasy_api.repositories.player_radar import PlayerRadarRepository
from fantasy_api.schemas.player_radar import (
    PlayerRadar,
    RadarAxis,
    RadarCandidate,
    RadarQuery,
    RadarResponse,
    RadarSnapshot,
)


def build_radar(
    snapshot: RadarSnapshot, *, now: datetime | None = None, stale_hours: int = 72
) -> PlayerRadar:
    """Create seven fixed axes and a comparison key only for documented populations."""
    definition = PROFILES[snapshot.profile]
    complete = all(value is not None for value in snapshot.percentiles.values())
    eligible = not (
        snapshot.cohort
        and snapshot.cohort.minimum_minutes is not None
        and snapshot.minutes < snapshot.cohort.minimum_minutes
    )
    comparison_key = None
    if snapshot.cohort is not None and complete and eligible:
        identity = {
            "profile": snapshot.profile,
            "season": snapshot.season,
            "competition": snapshot.competition,
            "period": snapshot.period,
            "source": snapshot.source,
            "method": snapshot.method,
            "recipe": snapshot.recipe_version,
            "source_metrics": snapshot.source_metrics,
            "cohort": snapshot.cohort.model_dump(mode="json"),
            "axes": definition.metrics,
        }
        comparison_key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    reason = None
    if not eligible:
        reason = "Insufficient minutes for this reference population."
    elif not complete:
        reason = "All seven metrics are required for comparison."
    elif snapshot.cohort is None:
        reason = "Reference population is unverified; comparison is unavailable."
    current = now or datetime.now(UTC)
    return PlayerRadar(
        **snapshot.model_dump(
            include=set(RadarSnapshot.model_fields) - {"percentiles", "source_metrics", "stale"}
        ),
        profile_label=definition.label,
        position=definition.position,
        axes=[
            RadarAxis(
                key=key,
                label=label,
                definition=description,
                percentile=snapshot.percentiles[key],
                source=snapshot.source,
                source_metric=snapshot.source_metrics.get(key, key),
                status="available" if snapshot.percentiles[key] is not None else "not_published",
            )
            for key, label, description in definition.metrics
        ],
        comparison_key=comparison_key,
        comparison_reason=reason,
        stale=snapshot.stale
        or (current - snapshot.fetched_at).total_seconds() > stale_hours * 3600,
    )


class PlayerRadarService:
    """Read the optional segment independently of Fantasy authentication and points."""

    def __init__(self, repository: PlayerRadarRepository) -> None:
        self._repository = repository

    async def get_radar(self, player_id: str, query: RadarQuery) -> RadarResponse:
        """Return available profiles and at most one server-validated comparison."""
        repository = await self._repository.pin()
        snapshots, seasons = await repository.get_snapshots(player_id, query.season, query.profile)
        coverage = repository.coverage(player_id, query.season)

        def render(row: RadarSnapshot) -> PlayerRadar:
            return build_radar(row, stale_hours=repository.stale_hours)

        order = list(PROFILES)
        radars = [render(row) for row in sorted(snapshots, key=lambda s: order.index(s.profile))]
        response = RadarResponse(
            player_id=player_id,
            season=query.season,
            available_seasons=seasons,
            status="available" if radars else "unavailable",
            reason=None if radars else "No radar dataset is available for this selection.",
            radars=radars,
            coverage=coverage,
            default_profile=(
                coverage.default_profile if coverage else (radars[0].profile if radars else None)
            ),
        )
        keys = {r.comparison_key for r in radars if r.comparison_key}
        if keys:
            known = await repository.comparison_snapshots(keys)
            for snapshot in known:
                if snapshot.player_id == player_id:
                    continue
                candidate = render(snapshot)
                if candidate.comparison_key in keys:
                    response.compatible_players.append(
                        RadarCandidate(
                            player_id=candidate.player_id,
                            player=candidate.player,
                            profile=candidate.profile,
                            club=candidate.club,
                        )
                    )
        if query.compare_player_id:
            if query.compare_player_id == player_id:
                response.comparison_reason = "Choose a different player."
            elif len(radars) != 1:
                response.comparison_reason = "Select one profile before comparing players."
            elif not radars[0].comparison_key:
                response.comparison_reason = radars[0].comparison_reason
            else:
                try:
                    candidates, _ = await repository.get_snapshots(
                        query.compare_player_id, query.season, radars[0].profile
                    )
                    candidate = render(candidates[0]) if len(candidates) == 1 else None
                    if candidate and candidate.comparison_key == radars[0].comparison_key:
                        response.comparison = candidate
                    else:
                        response.comparison_reason = (
                            "Players need the same profile, population, period and methodology."
                        )
                except UpstreamError:
                    response.comparison_reason = "Comparison data is temporarily unavailable."
        return response
