"""Parser entry points."""

import re
from collections.abc import Callable, Sequence
from typing import Literal, TypeVar
from urllib.parse import urlparse

from fantasy_scraping.models.page import PageKind, ScrapedPage, Source
from fantasy_scraping.parser.consistency import apply_consistency
from fantasy_scraping.parser.dom.document import parse_html
from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import ParseError, ParserSectionError, UnsupportedLayoutError
from fantasy_scraping.parser.extractors.base import ExtractionContext, sort_warnings
from fantasy_scraping.parser.extractors.fantasy_points import extract_fantasy_points
from fantasy_scraping.parser.extractors.fixtures import extract_fixtures
from fantasy_scraping.parser.extractors.identity import extract_identity
from fantasy_scraping.parser.extractors.injuries import extract_injuries
from fantasy_scraping.parser.extractors.market import extract_market
from fantasy_scraping.parser.extractors.matches import extract_matches
from fantasy_scraping.parser.extractors.meta import extract_meta
from fantasy_scraping.parser.extractors.news import extract_news
from fantasy_scraping.parser.extractors.personal import extract_personal
from fantasy_scraping.parser.extractors.position import extract_platforms, extract_position
from fantasy_scraping.parser.extractors.season_stats import extract_season_stats
from fantasy_scraping.parser.extractors.status import (
    extract_availability,
    extract_bid,
    extract_form,
    extract_hierarchy,
    extract_injury,
    extract_injury_risk,
    extract_start_probability,
)
from fantasy_scraping.parser.hashing import content_hash
from fantasy_scraping.parser.markdown.options import RenderOptions
from fantasy_scraping.parser.markdown.renderer import to_markdown
from fantasy_scraping.parser.markdown.report import render_player_report
from fantasy_scraping.parser.merge import merge_competitions
from fantasy_scraping.parser.models.futbolfantasy import (
    FixtureRow,
    FutbolFantasyPlayer,
    MatchesBlock,
    PlayerProfile,
    RecentMatch,
    same_fixture,
)
from fantasy_scraping.parser.models.parsed import ParsedPlayer
from fantasy_scraping.parser.models.stats import DaznStats
from fantasy_scraping.parser.models.supplement import FantasySupplement
from fantasy_scraping.parser.normalise.dates import madrid_date, season_from_slug
from fantasy_scraping.parser.normalise.minutes import minutes_note
from fantasy_scraping.parser.rules.loader import RuleRepository
from fantasy_scraping.parser.rules.schema import RuleSet
from fantasy_scraping.parser.settings import CORE_SECTIONS, ParserSettings

_PAGE_SEASON = re.compile(r"(\d{4})-(\d{2})")
T = TypeVar("T")
_DERIVE: tuple[tuple[str, str, str], ...] = (
    ("participation", "minutes", "minutes_played"),
    ("attack", "goals", "goals"),
    ("attack", "assists", "assists"),
    ("attack", "clear_chances_created", "big_chances_created"),
    ("attack", "successful_dribbles", "successful_dribbles"),
    ("attack", "own_goals", "own_goals"),
    ("discipline", "yellow_cards", "yellow_cards"),
    ("discipline", "red_cards", "red_card"),
    ("defense", "possessions_lost", "balls_lost"),
    ("defense", "effective_clearances", "clearances"),
    ("defense", "penalties_committed", "penalties_committed"),
    ("defense", "penalties_missed", "penalties_missed"),
    ("goalkeeper", "saves", "saves"),
    ("goalkeeper", "penalties_saved", "penalties_saved"),
)


class ParserService:
    """Turn saved FutbolFantasy HTML into a player model and Markdown.

    Args:
        rules: Rule repository. Defaults to the packaged TOML files.
        settings: Limits and version stamps. Not read from the environment.
    """

    def __init__(
        self,
        rules: RuleRepository | None = None,
        settings: ParserSettings | None = None,
    ) -> None:
        self.rules = rules or RuleRepository()
        self.settings = settings or ParserSettings()

    def parse_futbolfantasy(
        self,
        page: ScrapedPage,
        *,
        companions: Sequence[ScrapedPage] = (),
    ) -> FutbolFantasyPlayer:
        """Parse a player or competition page.

        Args:
            page: The main document.
            companions: Market widget and competition pages for the same player.

        Returns:
            One player. Competition companions are merged onto the main page.

        Raises:
            ParseError: The input or the document is rejected.
            UnsupportedLayoutError: Too many core sections failed.
        """
        self._guard(page)
        for companion in companions:
            self._guard(companion)
        rule_set = self.rules.load()
        player = self._parse_document(page, rule_set)
        player = self._overlay_market(player, companions, rule_set)
        extra = [
            self._parse_document(item, rule_set)
            for item in companions
            if item.kind == PageKind.COMPETITION
        ]
        if extra:
            player = merge_competitions([player, *extra])
        return apply_consistency(player, page.season)

    def parse(
        self,
        page: ScrapedPage,
        *,
        companions: Sequence[ScrapedPage] = (),
    ) -> ParsedPlayer:
        """Dispatch on ``page.source`` and attach the content hash.

        Args:
            page: Main document.
            companions: Extra documents for the same player.

        Returns:
            The parsed player and its content hash.
        """
        if page.source != Source.FUTBOLFANTASY:
            raise ParseError("input_invalid", "invalid input", section="meta")
        player = self.parse_futbolfantasy(page, companions=companions)
        parsed = ParsedPlayer(source="futbolfantasy", futbolfantasy=player, content_hash="")
        return parsed.model_copy(update={"content_hash": content_hash(parsed)})

    def merge_competitions(self, pages: Sequence[FutbolFantasyPlayer]) -> FutbolFantasyPlayer:
        """Merge already parsed competition pages.

        Args:
            pages: One model per competition page.

        Returns:
            The merged player.
        """
        return merge_competitions(list(pages))

    def to_markdown(
        self,
        model: FutbolFantasyPlayer,
        options: RenderOptions | None = None,
    ) -> str:
        """Render a player to deterministic Markdown.

        Args:
            model: Parsed player.
            options: Static-block and empty-section switches.

        Returns:
            Markdown with a single trailing newline.
        """
        return to_markdown(model, self.rules.load(), options or RenderOptions())

    def to_player_report(
        self,
        player: FutbolFantasyPlayer | ParsedPlayer,
        supplement: FantasySupplement | None = None,
    ) -> str:
        """Render the short player report from parsed JSON and optional supplement data.

        Args:
            player: Parsed FutbolFantasy tree or ``ParsedPlayer`` wrapper.
            supplement: LaLiga Fantasy weeks, market samples, and upcoming context.

        Returns:
            UTF-8 Markdown with one trailing newline.
        """
        model = player.futbolfantasy if isinstance(player, ParsedPlayer) else player
        return render_player_report(model, self.rules.load(), supplement)

    def _parse_document(self, page: ScrapedPage, rule_set: RuleSet) -> FutbolFantasyPlayer:
        document, person, jsonld_warnings = parse_html(page.html)
        self._check_season(page, document, rule_set)
        ctx = ExtractionContext(
            page=page,
            document=document,
            rules=rule_set,
            settings=self.settings,
            json_ld=person,
            warnings=list(jsonld_warnings),
        )
        self._assert_player(ctx)
        failed: list[str] = []
        identity = extract_identity(ctx)
        personal = self._isolate(ctx, extract_personal, section="profile.personal", failed=failed)
        matches = self._isolate(ctx, extract_matches, section="matches.recent", failed=failed)
        season = self._isolate(ctx, extract_season_stats, section="season_stats", failed=failed)
        fixtures = self._isolate(
            ctx,
            lambda current: extract_fixtures(
                current, is_goalkeeper=identity.position_code == "POR"
            ),
            section="fixtures",
            failed=failed,
            message="fixtures table missing",
        )
        if fixtures is None:
            fixtures = []
        if len(set(failed) & set(CORE_SECTIONS)) > self.settings.max_failed_core_sections:
            raise UnsupportedLayoutError("layout_drift", "layout drift", section="meta")
        if matches is None:
            matches = MatchesBlock()
        matches = _link_recent(ctx, matches, fixtures)
        season = _derive(ctx, season, fixtures)
        history = self._isolate(
            ctx,
            extract_injuries,
            section="injuries",
            path="profile.injury_history",
            severity="warning",
        )
        profile = PlayerProfile(
            identity=identity,
            injury=extract_injury(ctx),
            availability=extract_availability(ctx),
            form=extract_form(ctx),
            start_probability=extract_start_probability(ctx),
            injury_risk=extract_injury_risk(ctx),
            hierarchy=extract_hierarchy(ctx),
            max_profitable_bid=extract_bid(ctx),
            personal=personal,
            position=extract_position(ctx),
            platform_roles=extract_platforms(ctx),
            injury_history=history,
            news=extract_news(ctx),
        )
        return FutbolFantasyPlayer(
            meta=extract_meta(ctx, self.settings),
            profile=profile,
            matches=matches,
            market=extract_market(ctx),
            season_stats=season,
            fantasy_points=extract_fantasy_points(ctx),
            fixtures=fixtures,
            missing=sorted(set(ctx.missing)),
            warnings=sort_warnings(ctx.warnings),
        )

    def _overlay_market(
        self,
        player: FutbolFantasyPlayer,
        companions: Sequence[ScrapedPage],
        rule_set: RuleSet,
    ) -> FutbolFantasyPlayer:
        if player.market is not None:
            return player
        widget = next((item for item in companions if item.kind == PageKind.MARKET_WIDGET), None)
        if widget is None:
            return player
        document, person, warnings = parse_html(widget.html)
        ctx = ExtractionContext(
            page=widget,
            document=document,
            rules=rule_set,
            settings=self.settings,
            json_ld=person,
            warnings=list(warnings),
        )
        market = extract_market(ctx)
        if market is None:
            return player
        return player.model_copy(
            update={
                "market": market,
                "missing": sorted(path for path in player.missing if not path.startswith("market")),
                "warnings": sort_warnings([*player.warnings, *ctx.warnings]),
            }
        )

    def _guard(self, page: ScrapedPage) -> None:
        if page.source != Source.FUTBOLFANTASY or page.kind not in set(PageKind):
            raise ParseError("input_invalid", "invalid input", section="meta")
        if page.fetched_at.tzinfo is None or page.fetched_at.utcoffset() is None:
            raise ParseError("input_invalid", "invalid input", section="meta")
        if urlparse(page.url).scheme not in {"http", "https"}:
            raise ParseError("input_invalid", "invalid input", section="meta")
        if page.status_code != 200:
            raise ParseError("upstream_status", "upstream status", section="meta")
        encoded = page.html.encode("utf-8")
        if not page.html.strip():
            raise ParseError("html_empty", "html empty", section="meta")
        if len(encoded) > self.settings.max_html_bytes:
            raise ParseError("html_too_large", "html too large", section="meta")

    def _check_season(self, page: ScrapedPage, document: object, rule_set: RuleSet) -> None:
        expected = _PAGE_SEASON.fullmatch(page.season.strip())
        if expected is None:
            raise ParseError("season_mismatch", "season mismatch", section="meta")
        season_key = expected.group(0)
        anchor = madrid_date(page.fetched_at)
        slug = page.season_slug or urlparse(page.url).path.rstrip("/").split("/")[-1]
        from_url = season_from_slug(slug, anchor)
        if from_url is not None and from_url != season_key:
            raise ParseError("season_mismatch", "season mismatch", section="meta")
        selector = rule_set.selectors.canonical.removeprefix("css:")
        canonical = document.first(selector)  # type: ignore[union-attr]
        href = canonical.get("href") if canonical is not None else ""
        doc_slug = _canonical_season_slug(href or "")
        if doc_slug:
            from_doc = season_from_slug(doc_slug, anchor)
            if from_doc is None or from_doc != season_key:
                raise ParseError("season_mismatch", "season mismatch", section="meta")

    def _assert_player(self, ctx: ExtractionContext) -> None:
        name = ctx.document.first(ctx.selector("identity_name"))
        canonical = ctx.document.first(ctx.selector("canonical"))
        href = canonical.get("href") if canonical is not None else ""
        slug = _canonical_slug(href or "")
        anchors = any(
            ctx.document.first(item.removeprefix("css:")) is not None
            for item in ctx.rules.selectors.anchors
        )
        if slug and slug != ctx.page.player_slug:
            raise ParseError("slug_mismatch", "slug mismatch", section="identity")
        named = name is not None and bool(node_text(name))
        if not named or not (slug or anchors):
            raise ParseError("not_a_player_page", "not a player page", section="identity")

    def _isolate(
        self,
        ctx: ExtractionContext,
        extractor: Callable[[ExtractionContext], T],
        *,
        section: str,
        failed: list[str] | None = None,
        path: str | None = None,
        severity: Literal["info", "warning", "error"] = "error",
        message: str = "required section missing",
    ) -> T | None:
        """Run one extractor and record a section failure instead of raising."""
        target = path or section
        try:
            return extractor(ctx)
        except ParserSectionError:
            if failed is not None:
                failed.append(section)
            ctx.warn(
                code="required_anchor_missing",
                section=section,
                path=target,
                rule_id=target,
                message=message,
                severity=severity,
            )
            return None


def _link_recent(
    ctx: ExtractionContext,
    matches: MatchesBlock,
    fixtures: list[FixtureRow],
) -> MatchesBlock:
    linked: list[RecentMatch] = []
    resolved: set[int] = set()
    for index, recent in enumerate(matches.recent):
        fixture = _match_fixture(recent, fixtures)
        if fixture is None:
            linked.append(recent)
            continue
        note = recent.minutes
        if note.event == "subbed_off" and fixture.starter:
            note = minutes_note(note.raw, starter=True)
            resolved.add(index)
        linked.append(
            recent.model_copy(
                update={
                    "competition": fixture.competition,
                    "player_side": fixture.player_side,
                    "stats": fixture.stats,
                    "stats_source": "futbolfantasy",
                    "minutes": note,
                }
            )
        )
    if resolved:
        ctx.warnings = [
            item
            for item in ctx.warnings
            if not (item.code == "minutes_assumed_unknown" and item.index in resolved)
        ]
    return matches.model_copy(update={"recent": linked})


def _match_fixture(recent: RecentMatch, fixtures: list[FixtureRow]) -> FixtureRow | None:
    for fixture in fixtures:
        if same_fixture(fixture, on=recent.date, score=recent.score):
            return fixture
    return None


def _derive(ctx: ExtractionContext, season: object, fixtures: list[object]) -> object:
    if season is None:
        return None
    derived = list(season.derived_fields)
    for group_name, field_name, stat_name in _DERIVE:
        group = getattr(season, group_name)
        if group is None:
            continue
        published = _published_sum(fixtures, stat_name)
        current = getattr(group, field_name)
        path = f"season_stats.{group_name}.{field_name}"
        if current is None and published is not None:
            group = group.model_copy(update={field_name: published})
            season = season.model_copy(update={group_name: group})
            derived.append(path)
        elif current is not None and published is not None and current != published:
            ctx.warn(
                code="total_mismatch",
                section="season_stats",
                path=path,
                rule_id=path,
                message="season total does not match the match rows",
            )
    if derived != list(season.derived_fields):
        season = season.model_copy(update={"derived_fields": derived})
    return season


def _published_sum(fixtures: list[object], stat_name: str) -> int | None:
    total = 0
    seen = False
    for fixture in fixtures:
        stats = getattr(fixture, "stats", None)
        if not isinstance(stats, DaznStats):
            continue
        stat = getattr(stats, stat_name)
        if stat.status in {"ok", "partial"} and stat.count is not None:
            total += stat.count
            seen = True
    return total if seen else None


def _canonical_slug(href: str) -> str:
    parts = [part for part in urlparse(href).path.split("/") if part]
    if len(parts) >= 2 and parts[0] == "jugadores":
        return parts[1]
    return ""


def _canonical_season_slug(href: str) -> str:
    parts = [part for part in urlparse(href).path.rstrip("/").split("/") if part]
    if len(parts) >= 3 and parts[0] == "jugadores":
        return parts[-1]
    return ""
