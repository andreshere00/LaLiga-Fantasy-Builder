"""Round identity and strict first-kickoff target resolution."""

from datetime import datetime, timedelta

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.schemas.calendar import CurrentWeek, Fixture
from fantasy_api.schemas.lineup_builder import TargetWeek


def instant(value: str | None) -> datetime | None:
    """Parse only timezone-aware ISO timestamps; date-only values are uncertain."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def resolve_target(
    current: CurrentWeek, rounds: dict[int, list[Fixture]], now: datetime
) -> TargetWeek:
    """Resolve an unstarted Fantasy round without relabeling postponed matches.

    Args:
        current: Public Fantasy current-round metadata.
        rounds: Original round IDs and all their dated fixtures.
        now: Server snapshot instant.

    Returns:
        First kickoff and its builder deadlines.

    Raises:
        UpstreamError: Unknown/conflicting target context or no future round.
    """
    for week in sorted(rounds):
        fixtures = rounds[week]
        if not fixtures:
            continue
        dates = [instant(f.match_date or f.date) for f in fixtures]
        if any(day is None for day in dates):
            raise UpstreamError(
                "target fixture kickoff is unavailable",
                status_code=503,
                category="target_unavailable",
            )
        first = min(dates)
        started = any(f.match_state != 1 for f in fixtures)
        if first <= now:
            continue
        if started:
            raise UpstreamError(
                "target fixtures disagree with started state",
                status_code=503,
                category="target_deadline_conflict",
            )
        if week == current.week_number:
            opening = instant(current.opening_week_date)
            if current.is_live is True or opening is None or opening != first:
                raise UpstreamError(
                    "round opening disagrees with first kickoff",
                    status_code=503,
                    category="target_deadline_conflict",
                )
        return TargetWeek(
            week=week,
            first_kickoff=first,
            sales_deadline=first - timedelta(hours=24),
            clauses_deadline=first - timedelta(hours=24),
            protection_deadline=first - timedelta(hours=48),
        )
    raise UpstreamError("no unstarted supported round", status_code=409, category="no_target_week")
