"""Merge one player sheet with its competition pages."""

from fantasy_scraping.parser.errors import ParseError
from fantasy_scraping.parser.extractors.base import sort_warnings
from fantasy_scraping.parser.models.common import Competition, PartialParseWarning
from fantasy_scraping.parser.models.futbolfantasy import FutbolFantasyPlayer, RecentMatch
from fantasy_scraping.parser.models.stats import DaznStats


def merge_competitions(pages: list[FutbolFantasyPlayer]) -> FutbolFantasyPlayer:
    """Build one player from a LaLiga sheet plus competition sheets.

    Args:
        pages: Parsed pages. Profile, injuries and news come from the LaLiga page.

    Returns:
        One player whose fixtures are ordered by date, slug and matchday.

    Raises:
        ParseError: ``pages`` is empty.
    """
    if not pages:
        raise ParseError("input_invalid", "invalid input", section="meta")
    base = _laliga_page(pages)
    fixtures = []
    for page in pages:
        fixtures.extend(page.fixtures)
    fixtures.sort(
        key=lambda row: (
            row.date is None,
            row.date or _min_date(),
            row.competition_slug,
            row.matchday,
        )
    )
    recent: list[RecentMatch] = []
    warnings = [item for item in base.warnings if item.code != "competition_unresolved"]
    for index, row in enumerate(base.matches.recent):
        filled, join_warnings = _fill_recent(row, pages, index)
        recent.append(filled)
        warnings.extend(join_warnings)
        if (
            filled.competition == Competition.OTHER
            and filled.stats is None
            and not any(item.code == "competition_join_ambiguous" for item in join_warnings)
        ):
            warnings.append(
                PartialParseWarning(
                    code="competition_page_missing",
                    section="matches.recent",
                    path="matches.recent.stats",
                    rule_id="matches.recent.stats",
                    message="competition page missing",
                    index=index,
                )
            )
            warnings.append(
                PartialParseWarning(
                    code="competition_unresolved",
                    section="matches.recent",
                    path="matches.recent.competition",
                    rule_id="matches.recent.competition",
                    message="competition was not resolved",
                    index=index,
                )
            )
    missing = sorted(set(base.missing))
    return base.model_copy(
        update={
            "fixtures": fixtures,
            "matches": base.matches.model_copy(update={"recent": recent}),
            "warnings": sort_warnings(warnings),
            "missing": missing,
        }
    )


def _laliga_page(pages: list[FutbolFantasyPlayer]) -> FutbolFantasyPlayer:
    for page in pages:
        slug = page.meta.season_url or ""
        if slug.startswith("laliga"):
            return page
    return pages[0]


def _fill_recent(
    row: RecentMatch,
    pages: list[FutbolFantasyPlayer],
    index: int,
) -> tuple[RecentMatch, list[PartialParseWarning]]:
    if row.stats is not None and row.competition == Competition.LALIGA:
        return row, []
    if row.score is None:
        return row, []
    matches = _candidates(row, pages)
    if len(matches) > 1:
        return row, [
            PartialParseWarning(
                code="competition_join_ambiguous",
                section="matches.recent",
                path="matches.recent.stats",
                rule_id="matches.recent.stats",
                message="competition join is ambiguous",
                index=index,
            )
        ]
    if len(matches) != 1:
        return row, []
    fixture = matches[0]
    return (
        row.model_copy(
            update={
                "competition": fixture.competition,
                "stats": fixture.stats,
                "stats_source": "futbolfantasy",
                "competition_raw": fixture.competition_slug,
            }
        ),
        [],
    )


def _candidates(row: RecentMatch, pages: list[FutbolFantasyPlayer]) -> list[object]:
    found = []
    score = row.score
    if score is None:
        return found
    for page in pages:
        slug = page.meta.season_url or ""
        if slug.startswith("laliga"):
            continue
        for fixture in page.fixtures:
            if fixture.date != row.date:
                continue
            match = fixture.match
            if match.home_goals == score.home and match.away_goals == score.away:
                found.append(fixture)
    return found


def _min_date() -> object:
    from datetime import date

    return date.min


def stats_of(row: object) -> DaznStats | None:
    """Return fixture stats when the object has them."""
    stats = getattr(row, "stats", None)
    return stats if isinstance(stats, DaznStats) else None
