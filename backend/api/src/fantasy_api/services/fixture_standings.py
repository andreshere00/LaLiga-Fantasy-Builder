"""Compute completed-match standings from public season fixtures."""

from collections.abc import Callable
from datetime import UTC, datetime

from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.domain.ttl_cache import AsyncTtlCache
from fantasy_api.repositories.fixture_standings import FixtureStandingsRepository
from fantasy_api.schemas.fixture_standings import OfficialStandingsSnapshot, SeasonFixture
from fantasy_api.schemas.football_provider import FootballFixture, FootballStanding, FootballTeam
from fantasy_api.schemas.payload import as_object_list
from fantasy_api.schemas.standings import CompetitionStandings, StandingCompetition
from fantasy_api.schemas.stats_provider import TeamsMasterRow
from fantasy_api.services.standings import _club_results, _map_clubs, _models, _normalize_row


class FixtureStandingsService:
    """Build all requested fields and reconcile the result with the official table.

    Args:
        repository: Public season fixtures and private official classification.
        competition_id: Supported application competition id.
        ttl_seconds: Successful snapshot freshness window.
        clock: Optional UTC clock for deterministic tests.
    """

    def __init__(
        self,
        repository: FixtureStandingsRepository,
        *,
        competition_id: int,
        ttl_seconds: int,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._competition_id = competition_id
        self._clock = clock or (lambda: datetime.now(UTC))
        self._snapshot = AsyncTtlCache[CompetitionStandings](ttl_seconds)
        self._clubs = AsyncTtlCache[list[TeamsMasterRow]](86400)

    async def get_standings(
        self, competition_id: int, season: int | None, mode: str
    ) -> CompetitionStandings:
        """Return the verified current-season table from completed fixtures.

        Raises:
            NotFoundError: Unsupported competition or historical season.
            UpstreamError: Incomplete fixtures, inconsistent sources, or unavailable live mode.
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
            cached = self._snapshot.is_fresh()
            snapshot = await self._snapshot.get_or_fetch(self._fetch_snapshot)
        except ValueError:
            raise UpstreamError(
                "standings fixtures and official classification are inconsistent",
                status_code=502,
                category="standings_error",
            ) from None
        if season is not None and season != snapshot.season:
            raise NotFoundError("only the current season is supported by this source")
        return snapshot.model_copy(update={"cached": cached, "generated_at": self._clock()})

    async def _fetch_clubs(self) -> list[TeamsMasterRow]:
        """Validate the public real-club directory."""
        return _models(as_object_list(await self._repository.get_clubs()), TeamsMasterRow)

    async def _fetch_snapshot(self) -> CompetitionStandings:
        """Compute final results once per fixture and verify every club's season totals."""
        official = OfficialStandingsSnapshot.model_validate(
            await self._repository.get_official_standings()
        )
        teams = {
            row.team.id: FootballTeam(id=row.team.id, name=row.team.name) for row in official.rows
        }
        if len(teams) != 20:
            raise ValueError("duplicate official clubs")
        masters = await self._clubs.get_or_fetch(self._fetch_clubs)
        mapped = _map_clubs(teams, masters, {})
        badges = {
            master.id if master.id is not None else master.dsp_id: (master.model_extra or {}).get(
                "badgeColor"
            )
            for master in masters
        }
        mapped = {
            official_id: club.model_copy(
                update={
                    "badge_url": badge if isinstance(badge := badges.get(club.id), str) else None
                }
            )
            for official_id, club in mapped.items()
        }
        clubs = {club.id: club for club in mapped.values()}
        raw_fixtures = _models(await self._repository.get_fixtures(), SeasonFixture)
        seen: dict[str, SeasonFixture] = {}
        fixtures: list[FootballFixture] = []
        for match in raw_fixtures:
            if match.id in seen:
                if match != seen[match.id]:
                    raise ValueError("conflicting copies of a fixture")
                continue
            seen[match.id] = match
            if match.local_id == match.visitor_id:
                raise ValueError("fixture club cannot play itself")
            if match.local_id not in clubs or match.visitor_id not in clubs:
                raise ValueError("fixture outside current participant list")
            if match.match_state != 7:
                continue
            if match.match_date is None or match.local_score is None or match.visitor_score is None:
                raise ValueError("finished fixture is missing date or scores")
            if not (
                datetime(official.season, 7, 1, tzinfo=UTC)
                <= match.match_date
                < datetime(official.season + 1, 7, 1, tzinfo=UTC)
            ):
                raise ValueError("fixture outside published season")
            fixtures.append(
                FootballFixture.model_validate(
                    {
                        "fixture": {
                            "id": int(match.id),
                            "date": match.match_date,
                            "status": {"short": "FT"},
                        },
                        "league": {"id": self._competition_id, "season": official.season},
                        "teams": {
                            "home": {"id": match.local_id, "name": clubs[match.local_id].name},
                            "away": {"id": match.visitor_id, "name": clubs[match.visitor_id].name},
                        },
                        "goals": {"home": match.local_score, "away": match.visitor_score},
                    }
                )
            )
        histories = _club_results(
            fixtures, clubs, self._competition_id, official.season, "laliga-fantasy"
        )
        rows = []
        for baseline in official.rows:
            club = mapped[baseline.team.id]
            row = FootballStanding.model_validate(
                {
                    "rank": baseline.position,
                    "team": {"id": club.id, "name": club.name},
                    "points": baseline.points,
                    "goalsDiff": baseline.goal_difference,
                    "all": {
                        "played": baseline.played,
                        "win": baseline.won,
                        "draw": baseline.drawn,
                        "lose": baseline.lost,
                        "goals": {"for": baseline.goals_for, "against": baseline.goals_against},
                    },
                }
            )
            rows.append(_normalize_row(row, clubs, histories[club.id]))
        return CompetitionStandings(
            competition=StandingCompetition(id=self._competition_id, name="LALIGA EA SPORTS"),
            season=official.season,
            mode="completed",
            rows=sorted(rows, key=lambda row: row.position),
            source="laliga-fixtures",
            fetched_at=official.fetched_at,
            source_updated_at=None,
            generated_at=self._clock(),
            cached=False,
            is_provisional=False,
        )
