"""Shared value objects for the FutbolFantasy player tree."""

from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import Field, field_serializer

from fantasy_scraping.parser.models.base import ParserModel


class Competition(StrEnum):
    """Competition family derived from the season slug or a matched fixture."""

    LALIGA = "laliga"
    CONFERENCE_LEAGUE = "conference_league"
    EUROPA_LEAGUE = "europa_league"
    CHAMPIONS_LEAGUE = "champions_league"
    COPA_DEL_REY = "copa_del_rey"
    SUPERCOPA = "supercopa"
    OTHER = "other"


class Score(ParserModel):
    """Goals in the order the page printed them."""

    home: int
    away: int


class Ratio(ParserModel):
    """Numerator, optional denominator, optional integer percent."""

    numerator: int
    denominator: int | None = None
    percent: int | None = None


class CountPercent(ParserModel):
    """A count with an optional published percent."""

    count: int
    percent: int | None = None


class MinutesNote(ParserModel):
    """Minutes cell such as ``90'``, ``Sale 76'`` or ``Entra 62'``."""

    raw: str
    event: Literal["full", "subbed_off", "subbed_on", "unused", "unknown"]
    minutes: int | None = None
    minute: int | None = None


class PartialParseWarning(ParserModel):
    """Section-level warning. ``preview`` is cleaned text, never markup."""

    code: str
    section: str
    path: str
    rule_id: str
    message: str
    severity: Literal["info", "warning", "error"] = "warning"
    preview: str | None = None
    index: int = 0


class JsonLdPerson(ParserModel):
    """Person node read from JSON-LD. Used to fill gaps and to cross-check."""

    name: str | None = None
    birth_date: date | None = None
    birth_place: str | None = None
    nationalities: list[str] = Field(default_factory=list)
    height_cm: int | None = None
    url: str | None = None
    same_as: list[str] = Field(default_factory=list)


class SocialLink(ParserModel):
    """http or https profile link."""

    network: str
    url: str


class LabeledValue(ParserModel):
    """Season stat whose Spanish label is not in the map."""

    label: str
    raw: str
    parsed_int: int | None = None
    parsed_ratio: Ratio | None = None


class LabeledNumber(ParserModel):
    """Named number inside an expandable layer."""

    label: str
    value: float


class StatGroup(ParserModel):
    """One optgroup in the metric selector."""

    group: str
    stats: list[str] = Field(default_factory=list)


def utc_stamp(value: datetime) -> str:
    """Format an aware datetime as ``YYYY-MM-DDTHH:MM:SSZ``."""
    from datetime import UTC

    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class PageMeta(ParserModel):
    """Page identity. Totals on a player sheet are LaLiga-scoped."""

    source: Literal["futbolfantasy"]
    url: str
    slug: str
    season_url: str | None = None
    season_label: str | None = None
    club: str | None = None
    totals_scope: Literal["laliga"] = "laliga"
    market_widget_url: str | None = None
    market_widget_id: int | None = None
    extracted_on: date
    fetched_at: datetime
    parser_version: str
    rules_version: str
    layout: str
    input_sha256: str
    static_blocks_version: str
    json_ld: JsonLdPerson | None = None

    @field_serializer("fetched_at")
    def _serialize_fetched_at(self, value: datetime) -> str:
        return utc_stamp(value)
