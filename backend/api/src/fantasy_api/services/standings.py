"""Normalize complete provider standings and finalized league form."""

from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel

from fantasy_api.domain.clubs import ClubDirectory, load_alias_map
from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.domain.ttl_cache import AsyncTtlCache
from fantasy_api.repositories.standings import StandingsRepository
from fantasy_api.schemas.football_provider import (
    FootballFixture,
    FootballLeague,
    FootballRosterEntry,
    FootballStanding,
    FootballStandingResponse,
    FootballTeam,
)
from fantasy_api.schemas.payload import as_object_list
from fantasy_api.schemas.standings import (
    ClubStanding,
    CompetitionStandings,
    StandingClub,
    StandingCompetition,
    StandingMatch,
)
from fantasy_api.schemas.stats_provider import TeamsMasterRow


class StandingsService:
    """Provide authenticated callers with one consistent real-club table.

    Args:
        repository: Source data and club-id lookup.
        competition_id: Supported application competition id.
        ttl_seconds: Snapshot TTL, at least the provider's hourly cadence.
        club_ids: Verified provider-to-Fantasy club id overrides.
        clock: UTC clock override for deterministic tests.
    """

    def __init__(
        self,
        repository: StandingsRepository,
        *,
        competition_id: int,
        ttl_seconds: int,
        club_ids: dict[int, int],
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._competition_id = competition_id
        self._ttl = ttl_seconds
        self._club_ids = dict(club_ids)
        self._clock = clock or (lambda: datetime.now(UTC))
        self._league = AsyncTtlCache[FootballLeague](86400)
        self._clubs = AsyncTtlCache[list[TeamsMasterRow]](86400)
        self._snapshots: dict[int, AsyncTtlCache[CompetitionStandings]] = {}

    async def get_standings(
        self,
        competition_id: int,
        season: int | None,
        mode: str,
    ) -> CompetitionStandings:
        """Return a complete table, failing explicitly for unverified live data.

        Args:
            competition_id: Application competition, not a provider league id.
            season: Starting year or None to resolve the provider's current season.
            mode: ``completed`` or ``live``.

        Returns:
            Complete standings and source/cache timestamps.

        Raises:
            NotFoundError: For an unsupported competition or season.
            UpstreamError: For unavailable live support or inconsistent provider data.
        """
        if competition_id != self._competition_id:
            raise NotFoundError("competition is not supported")
        if mode != "completed":
            raise UpstreamError(
                "live standings are unavailable; request mode=completed",
                status_code=503,
                category="standings_live_unavailable",
            )
        try:
            league = await self._league.get_or_fetch(self._fetch_league)
            resolved = self._resolve_season(league, season)
            cache = self._snapshots.setdefault(
                resolved,
                AsyncTtlCache[CompetitionStandings](self._ttl),
            )
            cached = cache.is_fresh()
            snapshot = await cache.get_or_fetch(lambda: self._fetch_snapshot(league, resolved))
            return snapshot.model_copy(update={"cached": cached, "generated_at": self._clock()})
        except ValueError:
            raise UpstreamError(
                "standings provider returned inconsistent data",
                status_code=502,
                category="standings_error",
            ) from None

    async def _fetch_league(self) -> FootballLeague:
        """Verify the configured provider's league identity."""
        rows = await self._repository.get_league()
        if len(rows) != 1:
            raise ValueError("expected one provider league")
        league = FootballLeague.model_validate(rows[0])
        if league.league.id != self._repository.league_id:
            raise ValueError("unexpected provider league")
        if league.league.name.casefold() not in {
            "la liga",
            "laliga",
            "laliga ea sports",
            "primera división",
        }:
            raise ValueError("provider competition is not LALIGA")
        years = [item.year for item in league.seasons]
        if len(set(years)) != len(years):
            raise ValueError("duplicate provider season")
        return league

    def _resolve_season(self, league: FootballLeague, requested: int | None) -> int:
        """Resolve current-season metadata without guessing from today's date."""
        if requested is not None:
            if requested not in {season.year for season in league.seasons}:
                raise NotFoundError("season is not supported")
            return requested
        current = [season.year for season in league.seasons if season.current]
        if len(current) != 1:
            raise ValueError("expected one active provider season")
        return current[0]

    async def _fetch_clubs(self) -> list[TeamsMasterRow]:
        """Validate real Fantasy club identities used in provider mapping."""
        return _models(as_object_list(await self._repository.get_clubs()), TeamsMasterRow)

    async def _fetch_snapshot(self, league: FootballLeague, season: int) -> CompetitionStandings:
        """Fetch and normalize a single consistent snapshot without per-club calls."""
        raw = await self._repository.get_standings(season)
        if len(raw) != 1:
            raise ValueError("expected one standings response")
        table = FootballStandingResponse.model_validate(raw[0]).league
        if table.id != league.league.id or table.season != season:
            raise ValueError("unexpected standings competition or season")
        roster = _models(await self._repository.get_teams(season), FootballRosterEntry)
        teams = {entry.team.id: entry.team for entry in roster}
        # This adapter supports the 20-club LALIGA format, not arbitrary competitions.
        if len(teams) != 20 or len(roster) != 20:
            raise ValueError("incomplete or duplicate LALIGA participant list")
        standings = table.standings[0]
        ids = [row.team.id for row in standings]
        if len(ids) != 20 or len(set(ids)) != 20 or set(ids) != set(teams):
            raise ValueError("incomplete or duplicate standings clubs")
        clubs = _map_clubs(teams, await self._clubs.get_or_fetch(self._fetch_clubs), self._club_ids)
        fixtures = _models(await self._repository.get_fixtures(season), FootballFixture)
        results = _club_results(fixtures, clubs, league.league.id, season)
        rows = [_normalize_row(row, clubs, results[row.team.id]) for row in standings]
        updates = [row.update for row in standings if row.update is not None]
        now = self._clock()
        return CompetitionStandings(
            competition=StandingCompetition(id=self._competition_id, name="LALIGA EA SPORTS"),
            season=season,
            mode="completed",
            rows=sorted(rows, key=lambda row: row.position),
            source="api-football",
            fetched_at=now,
            source_updated_at=min(updates) if len(updates) == len(standings) else None,
            generated_at=now,
            cached=False,
            is_provisional=False,
        )


def _models[T: BaseModel](rows: Sequence[object], model: type[T]) -> list[T]:
    """Validate every collection member without discarding malformed rows."""
    return [model.model_validate(row) for row in rows]


def _map_clubs(
    teams: dict[int, FootballTeam],
    masters: list[TeamsMasterRow],
    overrides: dict[int, int],
) -> dict[int, StandingClub]:
    """Resolve unique club identities with deterministic aliases and verified overrides."""
    master_ids = [row.id if row.id is not None else row.dsp_id for row in masters]
    if not masters or len(set(master_ids)) != len(master_ids):
        raise ValueError("invalid Fantasy club directory")
    aliases = load_alias_map()
    alias_labels = {label.casefold(): target.casefold() for label, target in aliases.items()}
    directories = [
        ClubDirectory([row.model_dump(by_alias=True)], frozenset(), aliases) for row in masters
    ]
    by_id = {
        club.club_id: club
        for directory, club_id in zip(directories, master_ids, strict=True)
        if club_id is not None and (club := directory.by_id(club_id)) is not None
    }
    result: dict[int, StandingClub] = {}
    for provider_id, team in teams.items():
        if provider_id in overrides:
            club = by_id.get(overrides[provider_id])
            candidates = [club] if club is not None else []
        else:
            label = team.name.strip().casefold()
            labels = {label, alias_labels.get(label, label)}
            # Prefer exact identity before stripping club tokens: Real Madrid
            # and Atletico Madrid otherwise both normalize to "madrid".
            candidates = [club for club in by_id.values() if club.name.casefold() in labels]
            if not candidates:
                candidates = [
                    club
                    for directory in directories
                    if (club := directory.match(team.name)) is not None
                ]
        if len(candidates) != 1:
            raise ValueError("missing or ambiguous provider club identity")
        result[provider_id] = StandingClub(
            id=candidates[0].club_id,
            name=candidates[0].name,
            badge_url=team.logo,
        )
    if len({club.id for club in result.values()}) != len(result):
        raise ValueError("provider clubs collide on a Fantasy club id")
    return result


def _club_results(
    fixtures: list[FootballFixture],
    clubs: dict[int, StandingClub],
    league_id: int,
    season: int,
) -> dict[int, list[StandingMatch]]:
    """Build finalized league histories, rejecting duplicate and foreign fixtures."""
    results: dict[int, list[StandingMatch]] = {club_id: [] for club_id in clubs}
    seen: set[int] = set()
    for match in fixtures:
        if match.fixture.id in seen:
            raise ValueError("duplicate provider fixture")
        seen.add(match.fixture.id)
        home, away = match.teams.home.id, match.teams.away.id
        if match.league.id != league_id or match.league.season != season:
            raise ValueError("fixture outside requested competition or season")
        if home == away or home not in clubs or away not in clubs:
            raise ValueError("fixture has invalid participants")
        if match.fixture.status.short != "FT":
            # Administrative/cup outcomes have no verified domestic standings semantics.
            if match.fixture.status.short in {"AWD", "WO", "AET", "PEN"}:
                raise ValueError("unsupported domestic fixture outcome")
            continue
        home_goals, away_goals = match.goals.home, match.goals.away
        if home_goals is None or away_goals is None:
            raise ValueError("finalized fixture missing scores")
        sides: tuple[tuple[int, int, Literal["home", "away"], int, int], ...] = (
            (home, away, "home", home_goals, away_goals),
            (away, home, "away", away_goals, home_goals),
        )
        for club_id, opponent_id, venue, scored, conceded in sides:
            outcome: Literal["W", "D", "L"] = (
                "W" if scored > conceded else "L" if scored < conceded else "D"
            )
            results[club_id].append(
                StandingMatch(
                    match_id=f"api-football:{match.fixture.id}",
                    kickoff_at=match.fixture.date.astimezone(UTC),
                    opponent=clubs[opponent_id],
                    venue=venue,
                    goals_for=scored,
                    goals_against=conceded,
                    result=outcome,
                )
            )
    for history in results.values():
        history.sort(key=lambda match: (match.kickoff_at, match.match_id))
    return results


def _normalize_row(
    row: FootballStanding,
    clubs: dict[int, StandingClub],
    history: list[StandingMatch],
) -> ClubStanding:
    """Preserve authoritative rank/points and reject mismatched fixture snapshots."""
    record = row.record
    actual = (
        len(history),
        sum(match.result == "W" for match in history),
        sum(match.result == "D" for match in history),
        sum(match.result == "L" for match in history),
        sum(match.goals_for for match in history),
        sum(match.goals_against for match in history),
    )
    expected = (
        record.played,
        record.win,
        record.draw,
        record.lose,
        record.goals.scored,
        record.goals.against,
    )
    if actual != expected:
        raise ValueError("standings and finalized fixture snapshots disagree")
    return ClubStanding(
        team=clubs[row.team.id],
        position=row.rank,
        points=row.points,
        played=record.played,
        won=record.win,
        drawn=record.draw,
        lost=record.lose,
        goals_for=record.goals.scored,
        goals_against=record.goals.against,
        goal_difference=row.goals_diff,
        last5_matches=history[-5:],
    )
