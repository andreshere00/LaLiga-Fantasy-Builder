"""Player stats segment orchestration."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable, Mapping
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
    DetailSegment,
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
    PlayerDetailQuery,
    PlayerDetailResponse,
    PlayerFixtureStatsResponse,
    PlayerMarketResponse,
    PlayerProfileResponse,
    PlayerRef,
    PlayerStatsIndex,
    RecentMatch,
    RecentMatchesQuery,
    RecentMatchesResponse,
    SegmentDescriptor,
    SegmentError,
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
from fantasy_api.schemas.scraped import FutbolFantasyWire, ScrapedStat
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

_COMPETITION_SHORT: dict[Competition, str] = {
    Competition.LALIGA: "LEAGUE",
    Competition.CHAMPIONS_LEAGUE: "CHAMPIONS",
    Competition.EUROPA_LEAGUE: "EUROPA",
    Competition.CONFERENCE_LEAGUE: "CONFERENCE",
    Competition.COPA_DEL_REY: "COPA",
    Competition.SUPERCOPA: "SUPERCOPA",
    Competition.OTHER: "OTHER",
}

_DISPONIBLE_JORNADA = re.compile(r"disponible\s+para\s+la\s+jornada\s+(\d+)", re.IGNORECASE)

_DETAIL_SEGMENT_ORDER: tuple[DetailSegment, ...] = (
    "fixtures",
    "market",
    "recent",
    "upcoming",
    "profile",
)


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


def _competition_label(_raw: str | None, competition: Competition) -> str:
    return _COMPETITION_SHORT.get(competition, "OTHER")


def _display_club_name(entry: VenueEntry | None, code: str | None) -> str | None:
    if not code:
        return None
    if entry is None:
        return code
    for alias in entry.aliases:
        if alias.casefold() == code.casefold():
            continue
        if len(alias) > 3 or not alias.isupper():
            return alias
    return entry.name


def _player_short_club(
    wire: FutbolFantasyWire,
    player: ResolvedPlayer,
    venues: VenueDirectory,
) -> str | None:
    recent = (wire.matches.recent if wire.matches else None) or []
    for row in recent:
        if row.is_home is True and row.home_team:
            return row.home_team
        if row.is_home is False and row.away_team:
            return row.away_team
    entry = venues.for_club(
        fantasy_id=player.team_id,
        name=player.team_name,
    )
    if entry is not None:
        for alias in entry.aliases:
            if alias == "Barcelona" or (len(alias) > 3 and not alias.isupper()):
                return alias
        return entry.name
    return player.team_name


def _fill_fixture_teams(
    fixture: FixtureRef,
    *,
    short_club: str | None,
    opponent: str | None,
) -> FixtureRef:
    if fixture.is_home is None or not short_club or not opponent:
        return fixture
    home = fixture.home_team
    away = fixture.away_team
    if fixture.is_home:
        if not home:
            home = short_club
        if not away:
            away = opponent
    else:
        if not home:
            home = opponent
        if not away:
            away = short_club
    if home == fixture.home_team and away == fixture.away_team:
        return fixture
    return fixture.model_copy(update={"home_team": home, "away_team": away})


def _fixture_opponent(
    venues: VenueDirectory,
    *,
    is_home: bool | None,
    home_team: str | None,
    away_team: str | None,
) -> str | None:
    if is_home is None or not home_team or not away_team:
        return None
    code = away_team if is_home else home_team
    entry = venues.for_club(fantasy_id=None, name=code)
    return _display_club_name(entry, code)


def _expected_return_date(
    wire: FutbolFantasyWire,
    availability_text: str | None,
) -> date | None:
    if not availability_text:
        return None
    match = _DISPONIBLE_JORNADA.search(availability_text)
    if not match:
        return None
    matchweek = int(match.group(1))
    for row in (wire.matches.upcoming if wire.matches else None) or []:
        if row.matchweek == matchweek and row.date is not None:
            return row.date
    return None


def _weather_failure_detail(exc: UpstreamError) -> str:
    code = exc.provider_status
    if code in {401, 429} or (code is not None and code >= 500):
        return str(code)
    return "timeout"


def _started_from_minutes_event(event: str | None) -> bool | None:
    if event in ("full", "subbed_off"):
        return True
    if event in ("subbed_on", "unused"):
        return False
    return None


def _optional_label(value: object) -> str | None:
    return str(value) if value is not None else None


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
                available=scraping_ok,
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

    async def detail(
        self,
        player_id: str,
        query: PlayerDetailQuery,
    ) -> PlayerDetailResponse:
        """Return selected stats segments in one response."""
        player = await self._resolver.resolve(player_id)
        season = current_season(self._today())
        requested = set(query.include)
        segment_errors: list[SegmentError] = []
        fixtures: PlayerFixtureStatsResponse | None = None
        market: PlayerMarketResponse | None = None
        recent: RecentMatchesResponse | None = None
        upcoming: UpcomingMatchesResponse | None = None
        profile: PlayerProfileResponse | None = None

        async def run(name: DetailSegment) -> tuple[DetailSegment, Any | None, SegmentError | None]:
            if not self._detail_segment_available(name):
                err = SegmentError(
                    segment=name,
                    code="disabled",
                    detail="segment disabled",
                )
                return name, None, err
            try:
                payload = await self._detail_segment_call(player_id, name, query)
                return name, payload, None
            except UpstreamError as exc:
                err = SegmentError(
                    segment=name,
                    code=exc.category,
                    detail=str(exc),
                )
                return name, None, err

        tasks = [run(name) for name in _DETAIL_SEGMENT_ORDER if name in requested]
        results = await asyncio.gather(*tasks)
        for name, payload, err in results:
            if err is not None:
                segment_errors.append(err)
            if name == "fixtures":
                fixtures = payload
            elif name == "market":
                market = payload
            elif name == "recent":
                recent = payload
            elif name == "upcoming":
                upcoming = payload
            elif name == "profile":
                profile = payload

        top_player = self._player_ref(player)
        for segment in (profile, recent, upcoming, fixtures):
            if segment is None or segment.player is None:
                continue
            if segment.player.name or segment.player.team_name:
                top_player = segment.player
                break
        return PlayerDetailResponse(
            player_id=player_id,
            player=top_player,
            season=season.label,
            generated_at=self._now(),
            fixtures=fixtures,
            market=market,
            recent=recent,
            upcoming=upcoming,
            profile=profile,
            segment_errors=segment_errors,
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
            opponent = _fixture_opponent(
                self._venues,
                is_home=fixture.is_home,
                home_team=fixture.home_team,
                away_team=fixture.away_team,
            )
            fixture_ref = FixtureRef(
                date=parse_match_date(getattr(fixture, "date", None)),
                competition=competition,
                competition_label=_competition_label(raw_comp, competition),
                matchweek=fixture.matchweek,
                home_team=fixture.home_team,
                away_team=fixture.away_team,
                is_home=fixture.is_home,
                opponent=opponent,
                home_score=fixture.home_score,
                away_score=fixture.away_score,
                result=_match_result(
                    fixture.is_home,
                    fixture.home_score,
                    fixture.away_score,
                ),
            )
            parser_layer = _scraped_stats_layer(fixture.stats)
            layers = self._fixture_stat_layers(
                fantasy_weeks,
                competition=competition,
                matchweek=fixture.matchweek,
                parser_layer=parser_layer,
            )
            merged, warnings = merge_fixture_stats(
                layers,
                fantasy_points_total=fixture.fantasy_points,
                position_id=player.position_id,
                minutes_played=fixture.minutes,
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
            player=self._player_ref(player, doc.wire),
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
        fantasy_weeks = self._fantasy_week_map(player)
        matches: list[RecentMatch] = []
        for row in (wire.matches.recent if wire.matches else None) or []:
            competition = competition_from_row(row.competition_raw)
            fixture = FixtureRef(
                date=row.date,
                competition=competition,
                competition_label=_competition_label(row.competition_raw, competition),
                matchweek=row.matchweek,
                home_team=row.home_team,
                away_team=row.away_team,
                is_home=row.is_home,
                opponent=row.opponent,
                home_score=row.home_score,
                away_score=row.away_score,
                result=_match_result(row.is_home, row.home_score, row.away_score),
            )
            stats = None
            warnings: list[SegmentWarning] = []
            if query.include_stats and isinstance(row.stats, dict):
                parser_layer = stats_from_parser_layer(row.stats)
                layers = self._fixture_stat_layers(
                    fantasy_weeks,
                    competition=competition,
                    matchweek=row.matchweek,
                    parser_layer=parser_layer,
                )
                merged, merge_warnings = merge_fixture_stats(
                    layers,
                    fantasy_points_total=row.fantasy_points,
                    position_id=player.position_id,
                    minutes_played=row.minutes,
                )
                stats = merged
                warnings = merge_warnings
            matches.append(
                RecentMatch(
                    fixture=fixture,
                    minutes=MinutesPlayed(
                        minutes=row.minutes,
                        started=_started_from_minutes_event(row.minutes_event),
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
            player=self._player_ref(player, doc.wire),
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
        short_club = _player_short_club(wire, player, self._venues)
        player_home = self._venues.for_club(fantasy_id=player.team_id, name=player.team_name)
        rows: list[UpcomingMatch] = []
        now = self._now()
        for row in (wire.matches.upcoming if wire.matches else None) or []:
            competition = competition_from_row(row.competition_raw)
            fixture = FixtureRef(
                date=row.date,
                competition=competition,
                competition_label=_competition_label(row.competition_raw, competition),
                matchweek=row.matchweek,
                home_team=row.home_team,
                away_team=row.away_team,
                is_home=row.is_home,
                opponent=row.opponent,
            )
            fixture = _fill_fixture_teams(
                fixture,
                short_club=short_club,
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
            if query.include_weather and self._weather_enabled():
                weather, weather_warn = await self._weather_for_match(match_venue, kickoff)
                if weather_warn is not None:
                    row_warnings.append(weather_warn)
            else:
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
            player=self._player_ref(player, doc.wire),
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
            expected_return=_expected_return_date(
                wire,
                str(availability.get("label")) if isinstance(availability, dict) else None,
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
            raw=_optional_label(start_label),
        )
        risk_raw = profile.injury_risk or {}
        risk_label = risk_raw.get("label") if isinstance(risk_raw, dict) else None
        injury_risk = InjuryRiskInfo(
            level=map_injury_risk(risk_label if isinstance(risk_label, str) else None),
            raw=_optional_label(risk_label),
        )
        bid = profile.max_profitable_bid or {}
        bid_label = bid.get("label") if isinstance(bid, dict) else None
        max_bid = MaxProfitableBid(
            amount=bid.get("amount") if isinstance(bid, dict) else None,
            profitable=bid.get("profitable") if isinstance(bid, dict) else None,
            raw=_optional_label(bid_label),
        )
        hierarchy_raw = profile.hierarchy or {}
        hierarchy_label = hierarchy_raw.get("label") if isinstance(hierarchy_raw, dict) else None
        hierarchy = Hierarchy(
            label=_optional_label(hierarchy_label),
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
        if injury.since is None and injury_history:
            open_row = next((row for row in injury_history if row.ongoing), None)
            if open_row is not None:
                injury = injury.model_copy(update={"since": open_row.start, "active": True})
        segment_warnings = _wire_warnings(wire.warnings)
        return PlayerProfileResponse(
            player_id=player_id,
            player=self._player_ref(player, wire),
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

    def _player_ref(
        self,
        player: ResolvedPlayer,
        wire: FutbolFantasyWire | None = None,
    ) -> PlayerRef:
        name = player.name
        team_name = player.team_name
        if wire and wire.profile is not None:
            personal = wire.profile.personal
            if name is None and isinstance(personal, dict):
                name = personal.get("fullName") or personal.get("full_name")
        if team_name is None and player.team_id is not None:
            venue = self._venues.for_club(fantasy_id=player.team_id, name=None)
            if venue is not None:
                team_name = venue.name
        return PlayerRef(
            id=player.id,
            name=name,
            nickname=player.nickname,
            slug=player.slug,
            team_id=player.team_id,
            team_name=team_name,
            position_id=player.position_id,
        )

    def _today(self) -> date:
        return self._clock().astimezone(MADRID_TZ).date()

    def _now(self) -> datetime:
        value = self._clock()
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _fixture_stat_layers(
        self,
        fantasy_weeks: dict[int, Mapping[StatKey, ScrapedStat]],
        *,
        competition: Competition,
        matchweek: int | None,
        parser_layer: Mapping[StatKey, ScrapedStat] | None,
    ) -> list[tuple[StatSource, Mapping[StatKey, ScrapedStat]]]:
        """Build catalog + FutbolFantasy stat layers for one match row."""
        layers: list[tuple[StatSource, Mapping[StatKey, ScrapedStat]]] = []
        if matchweek is not None and competition == Competition.LALIGA:
            week_stats = fantasy_weeks.get(matchweek)
            if week_stats:
                layers.append((StatSource.FANTASY_CATALOG, week_stats))
        if parser_layer:
            layers.append((StatSource.FUTBOLFANTASY, parser_layer))
        return layers

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

    def _scraping_enabled(self) -> bool:
        return bool(self._settings.scraping_base_url)

    def _detail_segment_available(self, name: DetailSegment) -> bool:
        if name == "market":
            return True
        return self._scraping_enabled()

    async def _detail_segment_call(
        self,
        player_id: str,
        name: DetailSegment,
        query: PlayerDetailQuery,
    ) -> Any:
        if name == "fixtures":
            return await self.fixtures(player_id, query.fixtures_query())
        if name == "market":
            return await self.market(player_id, query.market_query())
        if name == "recent":
            return await self.recent_matches(player_id, query.recent_query())
        if name == "upcoming":
            return await self.upcoming_matches(player_id, query.upcoming_query())
        return await self.profile(player_id)

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
        if is_home is False:
            if not opponent:
                return None
            return self._venues.for_club(fantasy_id=None, name=opponent)
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
    ) -> tuple[MatchWeather, SegmentWarning | None]:
        if match_venue is None:
            return MatchWeather(snapshot=None, reason=WeatherReason.VENUE_UNKNOWN), None
        venue = self._venue_schema(match_venue)
        if kickoff is None:
            return (
                MatchWeather(snapshot=None, reason=WeatherReason.KICKOFF_UNKNOWN, venue=venue),
                None,
            )
        key = (round(match_venue.lat, 2), round(match_venue.lon, 2))
        cache = self._weather_cache.setdefault(
            key,
            AsyncTtlCache(self._settings.weather_ttl_seconds),
        )

        async def fetch() -> Any:
            return await self._stats_repo.get_forecast(match_venue.lat, match_venue.lon)

        try:
            payload = await cache.get_or_fetch(fetch)
        except UpstreamError as exc:
            return (
                MatchWeather(
                    snapshot=None,
                    reason=WeatherReason.PROVIDER_UNAVAILABLE,
                    venue=venue,
                ),
                SegmentWarning(
                    code="weather_unavailable",
                    source="openweather",
                    detail=_weather_failure_detail(exc),
                ),
            )
        slots = _forecast_slots(payload)
        picked = pick_slot(slots, kickoff.astimezone(UTC), self._now())
        if isinstance(picked, WeatherReason):
            return MatchWeather(snapshot=None, reason=picked, venue=venue), None
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
        return MatchWeather(snapshot=snapshot, reason=None, venue=venue), None

    def _travel(
        self,
        player_home: VenueEntry | None,
        is_home: bool | None,
        opponent: str | None,
    ) -> Travel:
        if player_home is None:
            return Travel(distance_km=None, reason="venue_unknown")
        home = self._venue_schema(player_home)
        if is_home is True:
            return Travel(
                distance_km=0.0,
                from_venue=home,
                to_venue=home,
                player_team_travels=False,
            )
        if is_home is False and not opponent:
            return Travel(
                distance_km=None,
                reason="venue_unknown",
                from_venue=home,
                to_venue=None,
                player_team_travels=True,
            )
        if not opponent:
            return Travel(distance_km=None, reason="venue_unknown", from_venue=home, to_venue=home)
        opponent_venue = self._venues.for_club(fantasy_id=None, name=opponent)
        if opponent_venue is None:
            travels = is_home is False
            return Travel(
                distance_km=None,
                reason="venue_unknown",
                from_venue=home,
                to_venue=None if travels else home,
                player_team_travels=True if travels else None,
            )
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
        message = str(item.get("message")) if item.get("message") else None
        preview = str(item.get("preview")) if item.get("preview") else None
        path = item.get("path") or item.get("ruleId")
        detail = message
        if code == "stat_label_unmapped" and preview:
            detail = f"{path}: {message} ({preview})" if message and path else preview
        elif path and message:
            detail = f"{path}: {message}"
        elif path:
            detail = str(path)
        out.append(
            SegmentWarning(
                code=code,
                source=str(item.get("source") or "futbolfantasy"),
                detail=detail,
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


def _as_float(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _as_int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return int(value)


def _mapping(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        return {}
    return {str(key): item for key, item in value.items()}


def _forecast_slots(payload: Any) -> list[ForecastSlot]:
    rows = payload.get("list") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    slots: list[ForecastSlot] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        dt_raw = row.get("dt")
        if not isinstance(dt_raw, int | float):
            continue
        main = _mapping(row.get("main"))
        weather_rows = row.get("weather")
        weather_item = weather_rows[0] if isinstance(weather_rows, list) and weather_rows else {}
        weather = _mapping(weather_item)
        rain = _mapping(row.get("rain"))
        wind = _mapping(row.get("wind"))
        condition_code = _as_int(weather.get("id"))
        icon = weather.get("icon")
        temperature = _as_float(main.get("temp"))
        slots.append(
            ForecastSlot(
                dt=datetime.fromtimestamp(int(dt_raw), tz=UTC),
                temperature_c=0.0 if temperature is None else temperature,
                feels_like_c=_as_float(main.get("feels_like")),
                humidity_pct=_as_int(main.get("humidity")),
                wind_speed_ms=_as_float(wind.get("speed")),
                precipitation_probability=_as_float(row.get("pop")),
                rain_mm=_as_float(rain.get("3h")),
                condition=str(weather.get("description") or ""),
                condition_code=condition_code,
                icon=str(icon) if isinstance(icon, str) else None,
            )
        )
    return slots
