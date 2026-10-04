"""Scraper-side contracts. ``ScrapedPage`` lives in ``fantasy_scraping.models``."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fantasy_scraping.models.page import PageKind, ScrapedPage

Metric = Literal["exact", "alias", "hamming", "levenshtein"]


class Candidate(BaseModel):
    """One scored slug."""

    model_config = ConfigDict(frozen=True)

    slug: str
    distance: int
    metric: Metric


class PlayerRoute(BaseModel):
    """Resolved player page.

    Attributes:
        slug: Route slug.
        url: Player URL for the requested season.
        distance: Winning distance.
        candidates: At most five scored alternatives, best first.
        metric: Metric that produced the winner.
        team_verified: True when the team probe matched, None when not checked.
    """

    model_config = ConfigDict(frozen=True)

    slug: str
    url: str
    distance: int
    candidates: list[Candidate] = Field(default_factory=list)
    metric: Metric
    team_verified: bool | None = None


class PlayerRef(BaseModel):
    """Caller-side player reference. ``playerTeamId`` is never accepted."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    full_name: str | None = Field(default=None, max_length=100)
    team: str | None = Field(default=None, max_length=100)
    player_id: str | None = Field(default=None, max_length=32)


class ScrapeOptions(BaseModel):
    """Per-request knobs that can only make the scraper more conservative."""

    model_config = ConfigDict(extra="forbid")

    bypass_cache: bool = False


class LinkedData(BaseModel):
    """Sitemap-derived index.

    Attributes:
        player_slugs: Every player route slug.
        team_slugs: Every club slug.
        fetched_at: UTC build time.
    """

    model_config = ConfigDict(frozen=True)

    player_slugs: tuple[str, ...]
    team_slugs: tuple[str, ...]
    fetched_at: datetime


class ScrapeOutcome(BaseModel):
    """Per-player batch result."""

    ref: PlayerRef
    pages: list[ScrapedPage] | None = None
    route: PlayerRoute | None = None
    error: dict[str, str] | None = None


__all__ = [
    "Candidate",
    "LinkedData",
    "PageKind",
    "PlayerRef",
    "PlayerRoute",
    "ScrapeOptions",
    "ScrapeOutcome",
    "ScrapedPage",
]
