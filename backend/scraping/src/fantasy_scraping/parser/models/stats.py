"""Per-fixture stat lines and the 19 DAZN fields."""

from typing import Literal

from pydantic import Field

from fantasy_scraping.parser.models.base import ParserModel

StatStatus = Literal["ok", "implied_zero", "partial", "unavailable", "not_applicable"]
StatSource = Literal["futbolfantasy", "fbref"]


class StatLine(ParserModel):
    """One DAZN metric on a match.

    Attributes:
        count: Published count. Absent when the layer did not include the metric.
        points: Fantasy points from the ``X p`` layer. A missing figure is ``0``.
        status: How the count was obtained.
        source: Which site published the count.
        reason: Stable absence or caveat code.
    """

    count: int | None = None
    points: float = 0.0
    status: StatStatus = "unavailable"
    source: StatSource | None = None
    reason: str | None = None


def line(
    *,
    count: int | None = None,
    points: float = 0.0,
    status: StatStatus = "ok",
    source: StatSource | None = "futbolfantasy",
    reason: str | None = None,
) -> StatLine:
    """Build one stat line."""
    return StatLine(count=count, points=points, status=status, source=source, reason=reason)


def unavailable(reason: str) -> StatLine:
    """A metric the delivered HTML did not publish."""
    return line(status="unavailable", source=None, reason=reason, points=0.0)


def not_applicable(reason: str = "goalkeeper_only") -> StatLine:
    """A goalkeeper metric on an outfield player, or the reverse case."""
    return line(status="not_applicable", source=None, reason=reason, points=0.0)


def implied_zero() -> StatLine:
    """The expand layer exists and this event is not in the published list."""
    return line(count=0, points=0.0, status="implied_zero", reason=None)


def unavailable_minutes() -> StatLine:
    """Default minutes line used before a row is read."""
    return unavailable("layer_missing")


class DaznStats(ParserModel):
    """The 19 fixed DAZN fields, in contract order."""

    minutes_played: StatLine = Field(default_factory=unavailable_minutes)
    goals: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    assists: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    big_chances_created: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    balls_into_box: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    penalties_committed: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    penalties_saved: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    saves: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    clearances: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    penalties_missed: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    own_goals: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    goals_conceded: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    yellow_cards: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    red_card: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    shots: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    successful_dribbles: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    ball_recoveries: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    balls_lost: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
    dazn_points: StatLine = Field(default_factory=lambda: unavailable("layer_missing"))
