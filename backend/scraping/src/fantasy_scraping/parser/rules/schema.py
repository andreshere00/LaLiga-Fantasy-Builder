"""Rule models loaded from TOML."""

from pydantic import Field

from fantasy_scraping.parser.models.base import ParserModel


class ExtractRule(ParserModel):
    """One scalar extraction rule.

    Attributes:
        id: Stable id used in warnings.
        target_path: Dotted path in the output model.
        locator: ``css:``, ``xpath:`` or ``label:``.
        fallbacks: Tried in order after ``locator``.
        read: ``text``, ``attr:<name>`` or ``count``.
        normaliser: Name in the normaliser registry.
        required: ``required``, ``expected`` or ``optional``.
        section: Warning section.
    """

    id: str
    target_path: str
    locator: str
    fallbacks: list[str] = Field(default_factory=list)
    read: str = "text"
    normaliser: str
    required: str = "optional"
    section: str = ""


class ColumnSpec(ParserModel):
    """One cell inside a table row."""

    id: str
    locator: str
    normaliser: str = "clean_text"
    read: str = "text"


class TableSpec(ParserModel):
    """Row locator plus relative cell locators."""

    id: str
    section: str
    target_path: str
    row_locator: str
    columns: list[ColumnSpec] = Field(default_factory=list)


class LabelRule(ParserModel):
    """Spanish label mapped to a season-stat or profile field."""

    label: str
    path: str
    normaliser: str
    group: str = ""


class EventRule(ParserModel):
    """One event used both to extract and to render."""

    key: str
    label: str
    category: str
    md_label: str
    singular: str = ""
    plural: str = ""
    icon: str = ""
    dazn_field: str = ""
    json_key: str = ""


class StatSlug(ParserModel):
    """``stat-*`` class suffix mapped to a DAZN field."""

    slug: str
    field: str
    json_key: str = ""
    shot_part: bool = False


class CompetitionAlias(ParserModel):
    """Published label or slug prefix mapped to a competition."""

    prefix: str
    competition: str
    label: str = ""


class CrossReference(ParserModel):
    """One DAZN concept paired with the field that stores it."""

    concept: str
    field: str


class StaticBlocks(ParserModel):
    """Wording rendered into Markdown and versioned in ``meta``."""

    version: str
    intro: str
    totals_scope: str
    tools: str
    layers_heading: str
    iconography_intro: str
    scope_limits: str
    other_modes: str
    cross_reference: list[CrossReference] = Field(default_factory=list)


class Selectors(ParserModel):
    """Structural selectors. The strings live in TOML, not in extractors."""

    canonical: str
    title: str
    club: str
    widget_link: str
    identity_name: str
    identity_shirt: str
    identity_position: str
    identity_badge: str
    medical: str
    availability: str
    form: str
    start_matchday: str
    start_percent: str
    risk_label: str
    risk_value: str
    hierarchy_label: str
    hierarchy_value: str
    personal_root: str
    personal_social: str
    position_main: str
    position_item: str
    field_map: str
    platform_row: str
    platform_name: str
    platform_role: str
    injury_root: str
    injury_zone: str
    injury_note: str
    injury_row: str
    news_root: str
    news_item: str
    recent_root: str
    recent_item: str
    upcoming_root: str
    upcoming_item: str
    partido: str
    market_root: str
    market_value: str
    market_change: str
    market_max: str
    market_min: str
    market_window: str
    market_season: str
    market_move: str
    market_bid: str
    market_series: str
    stats_root: str
    stats_big: str
    stats_info: str
    stats_label: str
    stats_value: str
    stats_view: str
    stats_matches: str
    selector_group: str
    points_root: str
    points_mode: str
    points_matches: str
    points_row: str
    points_last3: str
    points_mode_item: str
    fixtures_table: str
    fixtures_row: str
    poligono: str
    anchors: list[str] = Field(default_factory=list)


class RuleSet(ParserModel):
    """Every locator, label and static block the parser is allowed to use."""

    version: str
    rules: list[ExtractRule] = Field(default_factory=list)
    tables: list[TableSpec] = Field(default_factory=list)
    labels: list[LabelRule] = Field(default_factory=list)
    events: list[EventRule] = Field(default_factory=list)
    stat_slugs: list[StatSlug] = Field(default_factory=list)
    competitions: list[CompetitionAlias] = Field(default_factory=list)
    hierarchy: dict[str, int] = Field(default_factory=dict)
    static_blocks: StaticBlocks
    selectors: Selectors
    derivations: list[str] = Field(default_factory=list)
    unmapped_allowlist: list[str] = Field(default_factory=list)
