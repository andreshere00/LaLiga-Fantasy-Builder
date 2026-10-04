"""Shared page contract. The scraper fills it; the parser only reads it."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Source(StrEnum):
    """Third-party page family. FBref is not parsed."""

    FUTBOLFANTASY = "futbolfantasy"


class PageKind(StrEnum):
    """Which FutbolFantasy document a body represents."""

    PLAYER = "player"
    MARKET_WIDGET = "market_widget"
    COMPETITION = "competition"
    CLUB = "club"


class ScrapedPage(BaseModel):
    """One downloaded document plus the fetch metadata the parser is allowed to read.

    Attributes:
        source: Site family. Only ``futbolfantasy`` is accepted.
        kind: Player sheet, market widget, club calendar, or competition page.
        url: Absolute page URL.
        fetched_at: Original fetch time in UTC. Cached pages keep this instant.
        status_code: HTTP status. Anything other than 200 is rejected.
        html: Response body as text. Session cookies are already removed.
        from_cache: Informational. The parser does not branch on it.
        season: Season key such as ``2026-27``.
        player_slug: Route slug, checked against the canonical URL.
        season_slug: Competition route such as ``laliga-26-27``.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    source: Source
    kind: PageKind = PageKind.PLAYER
    url: str
    fetched_at: datetime
    status_code: int
    html: str
    from_cache: bool = False
    season: str
    player_slug: str
    season_slug: str = Field(default="")
