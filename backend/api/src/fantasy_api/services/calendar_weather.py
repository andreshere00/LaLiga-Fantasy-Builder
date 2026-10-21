"""Optional matchweek forecast aggregation, independent of fixture/score reads."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime

from fantasy_api.api.payload import as_model_list
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.lineup_builder.target import instant
from fantasy_api.domain.venues import VenueDirectory
from fantasy_api.repositories.calendar import CalendarRepository
from fantasy_api.schemas.calendar import CalendarWeather, Fixture, FixtureWeather, WeekWeather
from fantasy_api.schemas.player_stats import WeatherReason
from fantasy_api.services.weather import ForecastService


class CalendarWeatherService:
    """Join verified calendar matches with optional stadium forecasts.

    Args:
        repository: Public calendar repository; never exchanges a LaLiga bearer.
        forecasts: Shared, cached forecast service.
        venues: Verified club-to-stadium directory.
        enabled: Whether server-side provider credentials are configured.
        clock: UTC clock for eligibility and response generation.
    """

    def __init__(
        self,
        repository: CalendarRepository,
        forecasts: ForecastService,
        venues: VenueDirectory,
        *,
        enabled: bool,
        clock: Callable[[], datetime],
    ) -> None:
        self._repository = repository
        self._forecasts = forecasts
        self._venues = venues
        self._enabled = enabled
        self._clock = clock

    async def get_week(self, week: int) -> WeekWeather:
        """Return per-match forecasts; optional provider failures do not fail the round.

        Raises:
            UpstreamError: Malformed, oversized, or conflicting calendar data.
        """
        fixtures = as_model_list(await self._repository.get_fixtures(week), Fixture)
        ids = [match.id for match in fixtures]
        if len(fixtures) > 10 or any(not value for value in ids) or len(set(ids)) != len(ids):
            raise UpstreamError("calendar fixtures are inconsistent", status_code=502)
        return WeekWeather(
            week_number=week,
            generated_at=self._clock(),
            matches=list(await asyncio.gather(*(self._for_fixture(match) for match in fixtures))),
        )

    async def _for_fixture(self, match: Fixture) -> FixtureWeather:
        """Resolve a future kickoff without guessing unknown states or neutral grounds."""
        kickoff = next(
            (
                parsed
                for value in (match.match_date, match.date, match.time)
                if (parsed := instant(value))
            ),
            None,
        )
        row = FixtureWeather(
            fixture_id=match.id or "",
            local_id=match.local_id,
            visitor_id=match.visitor_id,
            kickoff=kickoff,
            weather=CalendarWeather(),
        )
        if match.match_state == 7 or (kickoff and kickoff <= self._clock().astimezone(UTC)):
            row.weather.reason = "match_started"
        elif not self._enabled:
            row.weather.reason = WeatherReason.DISABLED
        elif match.match_state != 1:
            row.weather.reason = "status_unknown"
        else:
            extra = match.model_extra or {}
            venue = self._venues.for_club(fantasy_id=match.local_id, name=None)
            # Undocumented venue overrides must not silently use the home club's ground.
            if any(extra.get(key) for key in ("venue", "stadium", "neutral", "neutralVenue")):
                venue = None
            result = await self._forecasts.for_match(venue, kickoff)
            row.weather = CalendarWeather(
                snapshot=result.weather.snapshot,
                reason=result.weather.reason,
                venue=result.weather.venue,
            )
            row.fetched_at = result.fetched_at
        return row
