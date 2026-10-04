"""Player stats segment orchestration."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from fantasy_api.config import Settings
from fantasy_api.domain.clubs import ClubDirectory
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.domain.geo import haversine_km
from fantasy_api.domain.market_window import (
    build_market_window,
    build_preset_summaries,
    normalise_history,
    resolve_window_request,
)
from fantasy_api.domain.season import current_season
from fantasy_api.domain.ttl_cache import AsyncTtlCache
from fantasy_api.domain.venues import VenueDirectory, VenueEntry
from fantasy_api.domain.weather import ForecastSlot, pick_slot
from fantasy_api.repositories.calendar import CalendarRepository
from fantasy_api.repositories.player_stats import PlayerStatsRepository
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.schemas.player_stats import (
    Competition,
    FixtureRef,
    FixturesQuery,
    FixtureStatsRow,
    Hierarchy,
    Injury,
    InjuryHistoryEntry,
    InjuryRiskInfo,
    MarketPreset,
    MarketQuery,
    MatchResult,
    MatchWeather,
    MaxProfitableBid,
    MinutesPlayed,
    NewsItem,
    PlayerFixtureStatsResponse,
    PlayerMarketResponse,
    PlayerProfileResponse,
    PlayerRef,
    PlayerStatsIndex,
    RecentMatch,
    RecentMatchesQuery,
    RecentMatchesResponse,
    SegmentDescriptor,
    SegmentWarning,
    SourceStatus,
    StartProbability,
    StatKey,
    StatSource,
    Travel,
    UpcomingMatch,
    UpcomingMatchesQuery,
    UpcomingMatchesResponse,
    Venue,
    WeatherReason,
    WeatherSnapshot,
)
from fantasy_api.schemas.scraped import ScrapedStat
from fantasy_api.services.player_resolver import PlayerResolver, ResolvedPlayer
from fantasy_api.services.scraped_player import ScrapedDocument, ScrapedPlayerProvider
from fantasy_api.services.stat_merge import merge_fixture_stats
from fantasy_api.services.wire_map import (
    competition_from_row,
    kickoff_datetime,
    map_injury_risk,
    parse_match_date,
    stats_from_fantasy_week,
    stats_from_parser_layer,
)

MADRID_TZ = ZoneInfo("Europe/Madrid")


def _match_result(
    is_home: bool | None,
    home_score: int | None,
    away_score: int | None,
) -> MatchResult | None:
    if is_home is None or home_score is None or away_score is None:
        return None
    player_goals = home_score if is_home else away_score
    opponent_goals = away_score if is_home else home_score
    if player_goals > opponent_goals:
        return MatchResult.WIN
    if player_goals < opponent_goals:
        return MatchResult.LOSS
    return MatchResult.DRAW


class PlayerStatsService:
    """Build player stats segment responses."""

    def __init__(
        self,
        *,
        resolver: PlayerResolver,
        players: PlayersRepository,
        calendar: CalendarRepository,
        scraped: ScrapedPlayerProvider,
        stats_repo: PlayerStatsRepository,
        venues: VenueDirectory,
        clock: Callable[[], datetime],
        settings: Settings,
    ) -> None:
        self._resolver = resolver
        self._players = players
        self._calendar = calendar
        self._scraped = scraped
        self._stats_repo = stats_repo
        self._venues = venues
        self._clock = clock
        self._settings = settings
        self._market_cache: dict[str, AsyncTtlCache[list[tuple[date, int]]]] = {}
        self._teams_master_cache = AsyncTtlCache[Any](settings.teams_master_ttl_seconds)
        self._weather_cache: dict[tuple[float, float], AsyncTtlCache[Any]] = {}
        self._clubs: ClubDirectory | None = None

    async def index(self, player_id: str) -> PlayerStatsIndex:
        """Return the stats segment catalogue for a player."""
        player = await self._resolver.resolve(player_id)
        season = current_season(self._today())
        scraping_ok = bool(self._settings.scraping_base_url)
        weather_ok = bool(
            self._settings.openweather_api_key
            and self._settings.openweather_api_key.get_secret_value()
        )
        segments = [
            SegmentDescriptor(
                name="fixtures",
                href=f"/players/{player_id}/stats/fixtures",
                auth="jwt",
                sources=["fantasy", "futbolfantasy"],
                requires_scraper=True,
                available=scraping_ok,
                query=["competition", "last"],
            ),
            SegmentDescriptor(
                name="market",
                href=f"/players/{player_id}/stats/market",
                auth="jwt",
                sources=["fantasy"],
                requires_scraper=False,
                available=True,
                query=["preset", "from", "to"],
            ),
            SegmentDescriptor(
                name="recent",
                href=f"/players/{player_id}/stats/matches/recent",
                auth="jwt",
                sources=["futbolfantasy", "fantasy"],
                requires_scraper=True,
                available=scraping_ok,
                query=["limit", "include_stats"],
            ),
            SegmentDescriptor(
                name="upcoming",
                href=f"/players/{player_id}/stats/matches/upcoming",
                auth="jwt",
                sources=["futbolfantasy", "fantasy", "openweather"],
                requires_scraper=True,
                available=scraping_ok and weather_ok,
                query=["limit", "include_weather"],
            ),
            SegmentDescriptor(
                name="profile",
                href=f"/players/{player_id}/stats/profile",
                auth="jwt",
                sources=["futbolfantasy", "fantasy"],
                requires_scraper=True,
                available=scraping_ok,
                query=[],
            ),
        ]
        return PlayerStatsIndex(
            player=self._player_ref(player),
            season=season.label,
            segments=segments,
            generated_at=self._now(),
        )

    async def fixtures(
        self,
        player_id: str,
        query: FixturesQuery,
    ) -> PlayerFixtureStatsResponse:
        """Return per-fixture stats rows."""
        player = await self._resolver.resolve(player_id)
        season = current_season(self._today())
        doc = await self._scraped.futbolfantasy(player, season)
        wire = doc.wire
        rows: list[FixtureStatsRow] = []
        fantasy_weeks = self._fantasy_week_map(player)
        segment_warnings: list[SegmentWarning] = []
        for fixture in wire.fixtures or []:
            raw_comp = getattr(fixture, "competition", None)
            competition = competition_from_row(raw_comp)
            if not raw_comp:
                segment_warnings.append(
                    SegmentWarning(
                        code="competition_unclassified",
                        source="futbolfantasy",
                        detail=None,
                    )
                )
            if query.competition and competition not in query.competition:
                continue
            fixture_ref = FixtureRef(
                date=parse_match_date(getattr(fixture, "date", None)),
                competition=competition,
                matchweek=fixture.matchweek,
                home_team=fixture.home_team,
                away_team=fixture.away_team,
                is_home=fixture.is_home,
                home_score=fixture.home_score,
                away_score=fixture.away_score,
                result=_match_result(
                    fixture.is_home,
                    fixture.home_score,
                    fixture.away_score,
                ),
            )
            layers: list[tuple[StatSource, dict]] = []
            week_stats = fantasy_weeks.get(fixture.matchweek or -1)
            if week_stats and competition == Competition.LALIGA:
                layers.append((StatSource.FANTASY_CATALOG, week_stats))
            parser_layer = _scraped_stats_layer(fixture.stats)
            if parser_layer:
                layers.append((StatSource.FUTBOLFANTASY, parser_layer))
            merged, warnings = merge_fixture_stats(
                layers,
                fantasy_points_total=fixture.fantasy_points,
            )
            rows.append(
                FixtureStatsRow(
                    fixture=fixture_ref,
                    minutes_played=fixture.minutes,
                    fantasy_points_total=fixture.fantasy_points,
                    stats=merged,
                    warnings=warnings,
                )
            )
        rows.sort(key=lambda row: row.fixture.date or date.min, reverse=True)
        rows = rows[: query.last]
        return PlayerFixtureStatsResponse(
            player_id=player_id,
            player=self._player_ref(player),
            season=season.label,
            generated_at=self._now(),
            sources=[self._ff_source(doc)],
            warnings=segment_warnings,
            fixtures=rows,
        )

    async def market(self, player_id: str, query: MarketQuery) -> PlayerMarketResponse:
        """Return market window and preset summaries."""
        season = current_season(self._today())
        today = self._today()

        dropped_invalid = 0

        async def load_history() -> list[tuple[date, int]]:
            nonlocal dropped_invalid
            raw = await self._stats_repo.get_market_history(player_id)
            if not isinstance(raw, list):
                raise UpstreamError("unexpected market history", category="fantasy_error")
            history, dropped_invalid = normalise_history(raw)
            return history

        cache = self._market_cache.setdefault(
            player_id,
            AsyncTtlCache(self._settings.market_history_ttl_seconds),
        )
        history = await cache.get_or_fetch(load_history)
        request = resolve_window_request(
            preset=query.preset or (MarketPreset.D30 if query.from_ is None else None),
            from_=query.from_,
            to=query.to,
            today=today,
            season_start=season.start,
            history=history,
        )
        window, warnings = build_market_window(
            history,
            request=request,
            today=today,
            season_start=season.start,
        )
        presets, preset_warnings = build_preset_summaries(
            history,
            today=today,
            season_start=season.start,
        )
        warnings.extend(preset_warnings)
        if dropped_invalid:
            warnings.append(
                SegmentWarning(
                    code="dropped_invalid_points",
                    source="fantasy",
                    detail=str(dropped_invalid),
                )
            )
        current_value = history[-1][1] if history else None
        return PlayerMarketResponse(
            player_id=player_id,
            player=None,
            season=season.label,
            generated_at=self._now(),
            sources=[SourceStatus(name="fantasy", status="ok", cached=False)],
            warnings=warnings,
            window=window,
            presets=presets,
            current_value=current_value,
        )

    async def recent_matches(
        self,
        player_id: str,
        query: RecentMatchesQuery,
    ) -> RecentMatchesResponse:
        """Return recent matches with optional stats."""
        player = await self._resolver.resolve(player_id)
        season = current_season(self._today())
        doc = await self._scraped.futbolfantasy(player, season)
        wire = doc.wire
        matches: list[RecentMatch] = []
        for row in (wire.matches.recent if wire.matches else None) or []:
            competition = competition_from_row(row.competition_raw)
            fixture = FixtureRef(
                date=row.date,
                competition=competition,
                matchweek=row.matchweek,
                is_home=row.is_home,
                opponent=row.opponent,
                home_score=row.home_score,
                away_score=row.away_score,
                result=_match_result(row.is_home, row.home_score, row.away_score),
            )
            stats = None
            warnings: list[SegmentWarning] = []
            if query.include_stats and isinstance(row.stats, dict):
                layer = stats_from_parser_layer(row.stats)
                merged, merge_warnings = merge_fixture_stats(
                    [(StatSource.FUTBOLFANTASY, layer)],
                    fantasy_points_total=row.fantasy_points,
                )
                stats = merged
                warnings = merge_warnings
            matches.append(
                RecentMatch(
                    fixture=fixture,
                    minutes=MinutesPlayed(
                        minutes=row.minutes,
                        note=row.minutes_note,
                    ),
                    fantasy_points_total=row.fantasy_points,
                    stats=stats,
                    warnings=warnings,
                )
            )
        matches = matches[: query.limit]
        return RecentMatchesResponse(
            player_id=player_id,
            player=self._player_ref(player),
            season=season.label,
            generated_at=self._now(),
            sources=[self._ff_source(doc)],
            warnings=[],
            matches=matches,
        )

    async def upcoming_matches(
        self,
        player_id: str,
        query: UpcomingMatchesQuery,
    ) -> UpcomingMatchesResponse:
        """Return upcoming matches with travel and weather."""
        player = await self._resolver.resolve(player_id)
        season = current_season(self._today())
        doc = await self._scraped.futbolfantasy(player, season)
        wire = doc.wire
        player_home = self._venues.for_club(fantasy_id=player.team_id, name=player.team_name)
        rows: list[UpcomingMatch] = []
        now = self._now()
        for row in (wire.matches.upcoming if wire.matches else None) or []:
            competition = competition_from_row(row.competition_raw)
            fixture = FixtureRef(
                date=row.date,
                competition=competition,
                matchweek=row.matchweek,
                is_home=row.is_home,
                opponent=row.opponent,
            )
            kickoff = kickoff_datetime(row.date, row.kickoff_time)
            row_warnings: list[SegmentWarning] = []
            if kickoff is not None and kickoff.astimezone(UTC) < now:
                row_warnings.append(
                    SegmentWarning(
                        code="schedule_mismatch",
                        source="futbolfantasy",
                        detail=None,
                    )
                )
                continue
            match_venue = self._match_venue(player_home, row.is_home, row.opponent)
            weather = MatchWeather(snapshot=None, reason=WeatherReason.DISABLED)
            if query.include_weather and self._weather_enabled():
                weather = await self._weather_for_match(match_venue, kickoff)
            elif not query.include_weather:
                weather = MatchWeather(snapshot=None, reason=WeatherReason.DISABLED)
            travel = self._travel(player_home, row.is_home, row.opponent)
            rows.append(
                UpcomingMatch(
                    fixture=fixture,
                    kickoff=kickoff,
                    weather=weather,
                    travel=travel,
                    warnings=row_warnings,
                )
            )
        rows = rows[: query.limit]
        return UpcomingMatchesResponse(
            player_id=player_id,
            player=self._player_ref(player),
            season=season.label,
            generated_at=self._now(),
            sources=[self._ff_source(doc)],
            warnings=[],
            matches=rows,
        )

    async def profile(self, player_id: str) -> PlayerProfileResponse:
        """Return global profile from FutbolFantasy."""
        player = await self._resolver.resolve(player_id)
        season = current_season(self._today())
        doc = await self._scraped.futbolfantasy(player, season)
        wire = doc.wire
        if wire.profile is None:
            raise UpstreamError("scraping error", category="scraping_error")
        profile = wire.profile
        availability = profile.availability
        injury_raw = profile.injury if isinstance(profile.injury, dict) else {}
        injury = Injury(
            fantasy_status=player.fantasy_status,
            active=injury_raw.get("ongoing") if injury_raw else None,
            diagnosis=(
                str(injury_raw.get("diagnosis"))
                if injury_raw.get("diagnosis") is not None
                else None
            ),
            since=parse_match_date(injury_raw.get("since")) if injury_raw else None,
            expected_return=(
                parse_match_date(injury_raw.get("expectedReturn")) if injury_raw else None
            ),
            availability_text=(
                str(availability.get("label")) if isinstance(availability, dict) else None
            ),
        )
        start = profile.start_probability or {}
        start_label = start.get("label") if isinstance(start, dict) else None
        start_probability = StartProbability(
            matchweek=start.get("matchday") if isinstance(start, dict) else None,
            percent=start.get("percent") if isinstance(start, dict) else None,
            raw=str(start_label) if start_label is not None else None,
        )
        risk_raw = profile.injury_risk or {}
        injury_risk = InjuryRiskInfo(
            level=map_injury_risk(risk_raw.get("label") if isinstance(risk_raw, dict) else None),
            raw=str(risk_raw.get("label")) if isinstance(risk_raw, dict) else None,
        )
        bid = profile.max_profitable_bid or {}
        max_bid = MaxProfitableBid(
            amount=bid.get("amount") if isinstance(bid, dict) else None,
            profitable=bid.get("profitable") if isinstance(bid, dict) else None,
            raw=str(bid.get("label")) if isinstance(bid, dict) else None,
        )
        hierarchy_raw = profile.hierarchy or {}
        hierarchy = Hierarchy(
            label=str(hierarchy_raw.get("label")) if isinstance(hierarchy_raw, dict) else None,
            rank=hierarchy_raw.get("rank") if isinstance(hierarchy_raw, dict) else None,
        )
        news: list[NewsItem] = []
        for item in profile.news or []:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "")
            if not title:
                continue
            published = (
                item.get("publishedOn") or item.get("publishedAt") or item.get("published_at")
            )
            news.append(
                NewsItem(
                    title=title,
                    url=item.get("url"),
                    published_at=published,
                    source=str(item.get("source") or "futbolfantasy"),
                )
            )
        news = news[:10]
        injury_history = self._injury_history_entries(profile)
        segment_warnings = _wire_warnings(wire.warnings)
        return PlayerProfileResponse(
            player_id=player_id,
            player=self._player_ref(player),
            season=season.label,
            generated_at=self._now(),
            sources=[self._ff_source(doc)],
            warnings=segment_warnings,
            injury=injury,
            start_probability=start_probability,
            injury_risk=injury_risk,
            injury_history=injury_history,
            max_profitable_bid=max_bid,
            hierarchy=hierarchy,
            news=news,
        )

    def _player_ref(self, player: ResolvedPlayer) -> PlayerRef:
        return PlayerRef(
            id=player.id,
            name=player.name,
            nickname=player.nickname,
            slug=player.slug,
            team_id=player.team_id,
            team_name=player.team_name,
            position_id=player.position_id,
        )

    def _today(self) -> date:
        return self._clock().astimezone(MADRID_TZ).date()

    def _now(self) -> datetime:
        value = self._clock()
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _fantasy_week_map(self, player: ResolvedPlayer) -> dict[int, Any]:
        out: dict[int, Any] = {}
        for week in player.last_stats or []:
            if not isinstance(week, dict):
                continue
            week_number = week.get("weekNumber")
            stats = week.get("stats")
            if week_number is None or not isinstance(stats, dict):
                continue
            out[int(week_number)] = stats_from_fantasy_week(stats)
        return out

    def _weather_enabled(self) -> bool:
        key = self._settings.openweather_api_key
        return bool(key and key.get_secret_value())

    def _venue_schema(self, entry: VenueEntry) -> Venue:
        return Venue(
            club_key=entry.club_key,
            stadium=entry.stadium,
            city=entry.city,
            lat=entry.lat,
            lon=entry.lon,
            country=entry.country,
        )

    def _match_venue(
        self,
        player_home: VenueEntry | None,
        is_home: bool | None,
        opponent: str | None,
    ) -> VenueEntry | None:
        if player_home is None:
            return None
        if is_home is False and opponent:
            opponent_venue = self._venues.for_club(name=opponent)
            return opponent_venue or player_home
        return player_home

    def _ff_source(self, doc: ScrapedDocument) -> SourceStatus:
        return SourceStatus(
            name="futbolfantasy",
            status="ok",
            cached=doc.cached,
            fetched_at=datetime.fromtimestamp(doc.fetched_at, tz=UTC),
        )

    def _injury_history_entries(self, profile: Any) -> list[InjuryHistoryEntry]:
        raw = getattr(profile, "injury_history", None)
        if not isinstance(raw, list):
            return []
        entries: list[InjuryHistoryEntry] = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            entries.append(
                InjuryHistoryEntry(
                    start=parse_match_date(row.get("start") or row.get("startDate")),
                    end=parse_match_date(row.get("end") or row.get("endDate")),
                    ongoing=bool(row.get("ongoing")),
                    diagnosis=(
                        str(row.get("diagnosis")) if row.get("diagnosis") is not None else None
                    ),
                    duration_days=row.get("durationDays") or row.get("duration_days"),
                )
            )
        return entries

    async def _weather_for_match(
        self,
        match_venue: VenueEntry | None,
        kickoff: datetime | None,
    ) -> MatchWeather:
        if match_venue is None:
            return MatchWeather(snapshot=None, reason=WeatherReason.VENUE_UNKNOWN)
        venue = self._venue_schema(match_venue)
        if kickoff is None:
            return MatchWeather(snapshot=None, reason=WeatherReason.KICKOFF_UNKNOWN, venue=venue)
        key = (round(match_venue.lat, 2), round(match_venue.lon, 2))
        cache = self._weather_cache.setdefault(
            key,
            AsyncTtlCache(self._settings.weather_ttl_seconds),
        )

        async def fetch() -> Any:
            return await self._stats_repo.get_forecast(match_venue.lat, match_venue.lon)

        try:
            payload = await cache.get_or_fetch(fetch)
        except UpstreamError:
            return MatchWeather(
                snapshot=None,
                reason=WeatherReason.PROVIDER_UNAVAILABLE,
                venue=venue,
            )
        slots = _forecast_slots(payload)
        picked = pick_slot(slots, kickoff.astimezone(UTC), self._now())
        if isinstance(picked, WeatherReason):
            return MatchWeather(snapshot=None, reason=picked, venue=venue)
        snapshot = WeatherSnapshot(
            temperature_c=picked.temperature_c,
            feels_like_c=picked.feels_like_c,
            humidity_pct=picked.humidity_pct,
            wind_speed_ms=picked.wind_speed_ms,
            precipitation_probability=picked.precipitation_probability,
            rain_mm=picked.rain_mm,
            condition=picked.condition,
            condition_code=picked.condition_code,
            icon=picked.icon,
            forecast_for=picked.dt,
        )
        return MatchWeather(snapshot=snapshot, reason=None, venue=venue)

    def _travel(
        self,
        player_home: VenueEntry | None,
        is_home: bool | None,
        opponent: str | None,
    ) -> Travel:
        if player_home is None:
            return Travel(distance_km=None, reason="venue_unknown")
        home = self._venue_schema(player_home)
        if not opponent:
            return Travel(distance_km=None, reason="venue_unknown", from_venue=home, to_venue=home)
        opponent_venue = self._venues.for_club(name=opponent)
        if opponent_venue is None:
            return Travel(distance_km=None, reason="venue_unknown", from_venue=home, to_venue=home)
        away = self._venue_schema(opponent_venue)
        distance = haversine_km(
            player_home.lat,
            player_home.lon,
            opponent_venue.lat,
            opponent_venue.lon,
        )
        if is_home is True:
            return Travel(
                distance_km=distance,
                from_venue=away,
                to_venue=home,
                player_team_travels=False,
            )
        if is_home is False:
            return Travel(
                distance_km=distance,
                from_venue=home,
                to_venue=away,
                player_team_travels=True,
            )
        return Travel(
            distance_km=distance,
            from_venue=home,
            to_venue=away,
            player_team_travels=None,
        )


def _wire_warnings(raw: list[Any] | None) -> list[SegmentWarning]:
    if not isinstance(raw, list):
        return []
    out: list[SegmentWarning] = []
    for item in raw[:10]:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or "scraping_partial")
        out.append(
            SegmentWarning(
                code=code,
                source=str(item.get("source") or "futbolfantasy"),
                detail=str(item.get("message")) if item.get("message") else None,
            )
        )
    return out


def _scraped_stats_layer(
    stats: dict[str, ScrapedStat] | None,
) -> dict[StatKey, ScrapedStat]:
    if not stats:
        return {}
    layer: dict[StatKey, ScrapedStat] = {}
    for key, value in stats.items():
        try:
            layer[StatKey(key)] = value
        except ValueError:
            continue
    return layer


def _forecast_slots(payload: Any) -> list[ForecastSlot]:
    rows = payload.get("list") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    slots: list[ForecastSlot] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        dt_raw = row.get("dt")
        main = row.get("main") or {}
        weather = (row.get("weather") or [{}])[0]
        rain = row.get("rain") or {}
        if dt_raw is None:
            continue
        slots.append(
            ForecastSlot(
                dt=datetime.fromtimestamp(int(dt_raw), tz=UTC),
                temperature_c=float(main.get("temp") or 0),
                feels_like_c=(
                    float(main.get("feels_like")) if main.get("feels_like") is not None else None
                ),
                humidity_pct=(
                    int(main.get("humidity")) if main.get("humidity") is not None else None
                ),
                wind_speed_ms=(
                    float((row.get("wind") or {}).get("speed") or 0) if row.get("wind") else None
                ),
                precipitation_probability=(
                    float(row.get("pop")) if row.get("pop") is not None else None
                ),
                rain_mm=float(rain.get("3h")) if rain.get("3h") is not None else None,
                condition=str(weather.get("description") or ""),
                condition_code=int(weather.get("id")) if weather.get("id") else None,
                icon=str(weather.get("icon")) if weather.get("icon") else None,
            )
        )
    return slots
