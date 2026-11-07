"""Assemble a real-club dossier from the catalog, fixtures, and scraped pages."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime

from pydantic import ValidationError

from fantasy_api.domain.club_pages import FutbolFantasyClubPages
from fantasy_api.domain.errors import NotFoundError, UpstreamError
from fantasy_api.repositories.clubs import ClubsRepository
from fantasy_api.schemas.clubs import (
    ClubDossier,
    ClubIndex,
    ClubMatch,
    ClubSegmentError,
    ClubSummary,
    CompetitionGroup,
    CompetitionRecord,
    InjuriesSection,
    InjuryItem,
    NewsItem,
    NewsSection,
    PerformanceSection,
    PredictedCoach,
    PredictedPlayer,
    PredictedSummary,
    PredictionSection,
    RosterCoverage,
    RosterMvp,
    RosterPlayer,
    RosterSection,
    RosterStatLine,
    ScrapedClubPage,
    VenueRecord,
)
from fantasy_api.schemas.fixture_standings import SeasonFixture
from fantasy_api.schemas.player_stats import StatKey
from fantasy_api.schemas.players import CatalogPlayer
from fantasy_api.schemas.stats_provider import TeamsMasterRow
from fantasy_api.services.wire_map import stats_from_fantasy_week

_COACH_POSITION = 5
_FINISHED = 7
_EUROPEAN = {"champions_league", "europa_league", "conference_league"}
_DOMESTIC = {"copa_del_rey", "supercopa"}
_COLUMNS: tuple[tuple[str, StatKey], ...] = (
    ("minutes", StatKey.MINUTES_PLAYED),
    ("goals", StatKey.GOALS),
    ("assists", StatKey.ASSISTS),
    ("dribbles", StatKey.SUCCESSFUL_DRIBBLES),
    ("penalties_committed", StatKey.PENALTIES_COMMITTED),
    ("penalties_saved", StatKey.PENALTIES_SAVED),
    ("shots", StatKey.SHOTS),
    ("recoveries", StatKey.RECOVERIES),
    ("saves", StatKey.SAVES),
    ("balls_lost", StatKey.BALLS_LOST),
    ("yellow_cards", StatKey.YELLOW_CARDS),
    ("red_cards", StatKey.RED_CARD),
)


class ClubsService:
    """Build the club index and one dossier.

    Args:
        repository: Catalog, fixture, and scraping reads.
        pages: Verified FutbolFantasy slugs for the current twenty.
    """

    def __init__(self, repository: ClubsRepository, pages: FutbolFantasyClubPages) -> None:
        self._repository = repository
        self._pages = pages

    async def list_clubs(self) -> ClubIndex:
        """Return the current clubs and their verified slugs.

        Raises:
            UpstreamError: The public club directory could not be read.
        """
        masters = {_master_id(row): row for row in await self._safe_clubs()}
        clubs: list[ClubSummary] = []
        for page in self._pages.clubs:
            master = masters.get(page.team_id)
            if master is None:
                raise UpstreamError(
                    "club directory is incomplete",
                    status_code=502,
                    category="upstream_error",
                )
            clubs.append(_summary(master, self._pages.slug_for(page.team_id)))
        return ClubIndex(clubs=clubs)

    async def get_dossier(self, club_id: int) -> ClubDossier:
        """Return one club dossier. Failed sections stay usable beside the others.

        Args:
            club_id: Teams-master id.

        Raises:
            NotFoundError: The id is not one of the current clubs.
            UpstreamError: The club directory itself could not be read.
        """
        page = next((item for item in self._pages.clubs if item.team_id == club_id), None)
        if page is None:
            raise NotFoundError("club not found")
        masters = {_master_id(row): row for row in await self._safe_clubs()}
        master = masters.get(club_id)
        if master is None:
            raise NotFoundError("club not found")
        summary = _summary(master, self._pages.slug_for(club_id))
        errors: list[ClubSegmentError] = []
        fixtures, fixture_error = await self._fixtures()
        finalized = 0
        if fixtures is not None:
            finalized = sum(
                1
                for fixture in fixtures
                if fixture.match_state == _FINISHED and _involves(club_id, fixture)
            )
        roster, roster_error = await self._roster(club_id, finalized)
        if roster_error:
            errors.append(roster_error)
        scraped, scrape_error = await self._scraped(summary.slug)
        news, news_error = await self._news(summary.slug)
        labels = {summary.name.casefold()}
        if summary.short_name:
            labels.add(summary.short_name.casefold())
        performance = None
        if not fixture_error:
            performance = _performance(club_id, fixtures or [], scraped, labels)
        if fixture_error:
            errors.append(fixture_error)
        elif scrape_error and summary.slug:
            errors.append(
                ClubSegmentError(
                    segment="performance",
                    code=scrape_error.code,
                    detail="other competitions are unavailable",
                )
            )
        if scrape_error:
            errors.extend(
                [
                    scrape_error.model_copy(update={"segment": "prediction"}),
                    scrape_error.model_copy(update={"segment": "injuries"}),
                ]
            )
        if news_error:
            errors.append(news_error)
        return ClubDossier(
            club=summary,
            roster=roster,
            performance=performance,
            prediction=None if scraped is None else _prediction(scraped),
            injuries=None if scraped is None else _injuries(scraped),
            news=news,
            segment_errors=errors,
        )

    async def _safe_clubs(self) -> list[TeamsMasterRow]:
        try:
            return await self._repository.clubs()
        except (UpstreamError, ValidationError, ValueError) as exc:
            raise _directory_error(exc) from exc

    async def _roster(
        self, club_id: int, finalized: int
    ) -> tuple[RosterSection | None, ClubSegmentError | None]:
        try:
            catalog = await self._repository.catalog()
            return _roster(club_id, catalog, finalized_count=finalized), None
        except (UpstreamError, ValidationError, ValueError) as exc:
            return None, _segment("roster", exc)

    async def _fixtures(self) -> tuple[list[SeasonFixture] | None, ClubSegmentError | None]:
        try:
            return await self._repository.fixtures(), None
        except (UpstreamError, ValidationError, ValueError) as exc:
            return None, _segment("performance", exc)

    async def _scraped(
        self, slug: str | None
    ) -> tuple[ScrapedClubPage | None, ClubSegmentError | None]:
        if not slug:
            return None, ClubSegmentError(
                segment="prediction",
                code="club_page_unavailable",
                detail="this club has no verified page",
            )
        try:
            return await self._repository.club_page(slug), None
        except (UpstreamError, ValidationError, ValueError) as exc:
            return None, _segment("prediction", exc)

    async def _news(self, slug: str | None) -> tuple[NewsSection | None, ClubSegmentError | None]:
        if not slug:
            return None, ClubSegmentError(
                segment="news",
                code="club_page_unavailable",
                detail="this club has no verified page",
            )
        try:
            news = await self._repository.club_news(slug)
        except (UpstreamError, ValidationError, ValueError) as exc:
            return None, _segment("news", exc)
        return (
            NewsSection(
                items=[
                    NewsItem(title=item.title, url=item.url, published_at=item.published_at)
                    for item in news.items
                ]
            ),
            None,
        )


def _roster(
    club_id: int, players: list[CatalogPlayer], *, finalized_count: int | None
) -> RosterSection:
    """Rank MVPs and total the published event counts for one club."""
    squad = [player for player in players if _team_id(player) == club_id and not _coach(player)]
    weeks: set[int] = set()
    rows: list[RosterPlayer] = []
    totals: dict[str, int] = {}
    for player in squad:
        counts, player_weeks = _counts(player.last_stats)
        weeks.update(player_weeks)
        for key, count in counts.items():
            totals[key] = totals.get(key, 0) + count
        rows.append(
            RosterPlayer(
                player_id=_player_id(player),
                name=_player_name(player),
                position_id=player.position_id,
                points=player.points,
                stats=_line({key: counts.get(key) for key, _stat in _COLUMNS}),
            )
        )
    played = finalized_count if finalized_count is not None else len(weeks)
    return RosterSection(
        mvps=_mvps(squad),
        players=rows,
        totals=_line({key: totals.get(key) for key, _stat in _COLUMNS}),
        coverage=RosterCoverage(
            players=len(rows),
            matchweeks=sorted(weeks),
            short_window=bool(weeks) and len(weeks) < played,
        ),
    )


def _performance(
    club_id: int,
    fixtures: list[SeasonFixture],
    scraped: ScrapedClubPage | None,
    labels: set[str],
) -> PerformanceSection:
    """Build LaLiga results from finalized fixtures and other results from the club page."""
    matches = [
        match
        for fixture in fixtures
        if _involves(club_id, fixture) and (match := _laliga_match(club_id, fixture)) is not None
    ]
    if scraped is not None:
        matches.extend(_other_matches(scraped, labels))
    finished = [
        match for match in matches if not match.scheduled and match.regulation_home is not None
    ]
    return PerformanceSection(
        matches=matches,
        records=_records(finished),
        next_match_id=_next_match(matches),
    )


def _prediction(page: ScrapedClubPage) -> PredictionSection:
    return PredictionSection(
        matchday=page.matchday,
        coach=(
            None if page.coach is None else PredictedCoach.model_validate(page.coach.model_dump())
        ),
        starters=[PredictedPlayer.model_validate(player.model_dump()) for player in page.starters],
        alternatives=[
            PredictedPlayer.model_validate(player.model_dump()) for player in page.alternatives
        ],
        summary=(
            None
            if page.summary is None
            else PredictedSummary.model_validate(page.summary.model_dump())
        ),
    )


def _injuries(page: ScrapedClubPage) -> InjuriesSection:
    if page.injuries is None:
        return InjuriesSection(published=False, items=[])
    return InjuriesSection(
        published=True,
        items=[
            InjuryItem(
                name=item.name,
                profile_url=item.profile_url,
                photo_url=item.photo_url,
                diagnosis=item.diagnosis,
                started_on=item.started_on,
                expected_return=item.expected_return,
                status=item.status,
            )
            for item in page.injuries
        ],
    )


def _mvps(players: list[CatalogPlayer]) -> list[RosterMvp]:
    ranked = [player for player in players if isinstance(player.points, int)]
    ranked.sort(
        key=lambda player: (
            -int(player.points or 0),
            _player_name(player).casefold(),
            _player_id(player),
        )
    )
    return [
        RosterMvp(
            player_id=_player_id(player),
            name=_player_name(player),
            points=int(player.points or 0),
            position_id=player.position_id,
        )
        for player in ranked[:3]
    ]


def _counts(last_stats: object) -> tuple[dict[str, int], set[int]]:
    totals: dict[str, int] = {}
    weeks: set[int] = set()
    if not isinstance(last_stats, list):
        return totals, weeks
    for row in last_stats:
        if not isinstance(row, dict):
            continue
        week = row.get("weekNumber", row.get("week_number"))
        if isinstance(week, int):
            weeks.add(week)
        stats = row.get("stats")
        if not isinstance(stats, dict):
            continue
        mapped = stats_from_fantasy_week(stats)
        for name, key in _COLUMNS:
            stat = mapped.get(key)
            if stat is None or stat.count is None:
                continue
            totals[name] = totals.get(name, 0) + stat.count
    return totals, weeks


def _line(values: dict[str, int | None]) -> RosterStatLine:
    return RosterStatLine.model_validate(values)


def _laliga_match(club_id: int, fixture: SeasonFixture) -> ClubMatch | None:
    home = fixture.local_id == club_id
    scheduled = fixture.match_state != _FINISHED
    scored = fixture.local_score is not None and fixture.visitor_score is not None
    if not scheduled and not scored:
        return None
    outcome = None
    if scored and not scheduled:
        assert fixture.local_score is not None and fixture.visitor_score is not None
        club_goals = fixture.local_score if home else fixture.visitor_score
        other_goals = fixture.visitor_score if home else fixture.local_score
        if club_goals > other_goals:
            outcome = "win"
        elif club_goals < other_goals:
            outcome = "loss"
        else:
            outcome = "draw"
    return ClubMatch(
        match_id=fixture.id,
        competition="laliga",
        group="laliga",
        home=str(fixture.local_id),
        away=str(fixture.visitor_id),
        kickoff=fixture.match_date,
        regulation_home=fixture.local_score,
        regulation_away=fixture.visitor_score,
        outcome=outcome,
        venue="home" if home else "away",
        scheduled=scheduled,
    )


def _other_matches(page: ScrapedClubPage, labels: set[str]) -> list[ClubMatch]:
    matches: list[ClubMatch] = []
    for fixture in page.fixtures:
        group = _group(fixture.competition)
        if group == "laliga":
            continue
        home_name = fixture.home.casefold()
        matches.append(
            ClubMatch(
                match_id=fixture.url or f"{fixture.home}-{fixture.away}",
                competition=fixture.competition,
                group=group,
                home=fixture.home,
                away=fixture.away,
                home_badge=fixture.home_badge,
                away_badge=fixture.away_badge,
                kickoff_text=fixture.kickoff,
                round_label=fixture.round_label,
                regulation_home=None if fixture.regulation is None else fixture.regulation.home,
                regulation_away=None if fixture.regulation is None else fixture.regulation.away,
                final_home=None if fixture.final is None else fixture.final.home,
                final_away=None if fixture.final is None else fixture.final.away,
                outcome=fixture.outcome,
                venue="home" if home_name in labels else "away",
                scheduled=fixture.scheduled,
            )
        )
    return matches


def _records(matches: Iterable[ClubMatch]) -> list[CompetitionRecord]:
    grouped: dict[CompetitionGroup, list[ClubMatch]] = defaultdict(list)
    for match in matches:
        grouped[match.group].append(match)
    order: tuple[CompetitionGroup, ...] = ("laliga", "european", "domestic", "friendly")
    return [_record(group, grouped[group]) for group in order if group in grouped]


def _record(group: CompetitionGroup, matches: list[ClubMatch]) -> CompetitionRecord:
    home = VenueRecord()
    away = VenueRecord()
    goals_for = 0
    goals_against = 0
    for match in matches:
        if match.regulation_home is None or match.regulation_away is None or match.outcome is None:
            continue
        venue = home if match.venue == "home" else away
        if match.outcome == "win":
            venue.won += 1
        elif match.outcome == "draw":
            venue.drawn += 1
        else:
            venue.lost += 1
        goals_for += match.regulation_home if match.venue == "home" else match.regulation_away
        goals_against += match.regulation_away if match.venue == "home" else match.regulation_home
    return CompetitionRecord(
        competition=group,
        won=home.won + away.won,
        drawn=home.drawn + away.drawn,
        lost=home.lost + away.lost,
        home=home,
        away=away,
        goals_for=goals_for,
        goals_against=goals_against,
    )


def _next_match(matches: list[ClubMatch]) -> str | None:
    dated = [
        match
        for match in matches
        if match.scheduled and match.kickoff is not None and match.group == "laliga"
    ]
    if not dated:
        upcoming = next((match for match in matches if match.scheduled), None)
        return None if upcoming is None else upcoming.match_id
    dated.sort(key=lambda match: match.kickoff or datetime.min.replace(tzinfo=UTC))
    return dated[0].match_id


def _group(competition: str) -> CompetitionGroup:
    if competition in _EUROPEAN:
        return "european"
    if competition in _DOMESTIC:
        return "domestic"
    if competition == "friendly":
        return "friendly"
    return "laliga"


def _involves(club_id: int, fixture: SeasonFixture) -> bool:
    return fixture.local_id == club_id or fixture.visitor_id == club_id


def _coach(player: CatalogPlayer) -> bool:
    return player.position_id == _COACH_POSITION


def _team_id(player: CatalogPlayer) -> int | None:
    raw = player.team_id
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.isdigit():
        return int(raw)
    return None


def _player_id(player: CatalogPlayer) -> str:
    return "" if player.id is None else str(player.id)


def _player_name(player: CatalogPlayer) -> str:
    return player.nickname or player.name or _player_id(player)


def _summary(master: TeamsMasterRow, slug: str | None) -> ClubSummary:
    extra = master.model_extra or {}
    badge = extra.get("badgeColor") or extra.get("badge_color")
    return ClubSummary(
        club_id=master.id or master.dsp_id or 0,
        name=master.name,
        short_name=master.short_name,
        badge_url=badge if isinstance(badge, str) else None,
        slug=slug,
    )


def _master_id(row: TeamsMasterRow) -> int:
    return row.id or row.dsp_id or 0


def _directory_error(exc: Exception) -> UpstreamError:
    if isinstance(exc, UpstreamError):
        return exc
    return UpstreamError(
        "club directory was unavailable",
        status_code=502,
        category="upstream_error",
    )


def _segment(name: str, exc: Exception) -> ClubSegmentError:
    code = exc.category if isinstance(exc, UpstreamError) else "upstream_error"
    detail = str(exc) if isinstance(exc, UpstreamError) else "upstream data was unavailable"
    return ClubSegmentError(segment=name, code=code, detail=detail[:200])  # type: ignore[arg-type]
