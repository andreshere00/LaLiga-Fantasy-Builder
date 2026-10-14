"""Cache the official current-season classification for fixture reconciliation."""

import asyncio
import json
import re
from datetime import UTC, datetime
from html.parser import HTMLParser
from urllib.parse import urlsplit

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt, model_validator

from fantasy_scraping.scraper.errors import HostNotAllowedError, UnexpectedContentError
from fantasy_scraping.scraper.http_client import ScrapingHttpClient
from fantasy_scraping.scraper.settings import ScraperSettings

ORIGIN = "https://www.laliga.com"
STANDINGS_URL = f"{ORIGIN}/laliga-easports/clasificacion"
ROBOTS_URL = f"{ORIGIN}/robots.txt"


def allowed_standings_url(url: str) -> str:
    """Allow only the official canonical table and its robots policy, including redirects."""
    parts = urlsplit(url)
    if (
        parts.scheme != "https"
        or parts.netloc != "www.laliga.com"
        or parts.path not in {"/robots.txt", "/laliga-easports/clasificacion"}
        or parts.query
        or parts.fragment
    ):
        raise HostNotAllowedError()
    return url


class OfficialClub(BaseModel):
    """Public official club identity; ids are mapped by the API layer."""

    model_config = ConfigDict(extra="allow")
    id: StrictInt = Field(gt=0)
    name: str = Field(min_length=1)


class OfficialStanding(BaseModel):
    """One overall classification row, never a home/away-only row."""

    model_config = ConfigDict(extra="allow")
    team: OfficialClub
    position: StrictInt = Field(ge=1, le=20)
    points: StrictInt
    played: StrictInt = Field(ge=0)
    won: StrictInt = Field(ge=0)
    drawn: StrictInt = Field(ge=0)
    lost: StrictInt = Field(ge=0)
    goals_for: StrictInt = Field(ge=0)
    goals_against: StrictInt = Field(ge=0)
    goal_difference: StrictInt

    @model_validator(mode="after")
    def validate_totals(self) -> OfficialStanding:
        """Reject inconsistent official totals."""
        if self.played != self.won + self.drawn + self.lost:
            raise ValueError("inconsistent official results")
        if self.goal_difference != self.goals_for - self.goals_against:
            raise ValueError("inconsistent official goals")
        return self


class OfficialStandingsSnapshot(BaseModel):
    """Validated metadata and twenty public rows; no HTML or unrelated page state."""

    model_config = ConfigDict(extra="allow")
    season: StrictInt = Field(ge=2000, le=2100)
    rows: list[OfficialStanding] = Field(min_length=20, max_length=20)
    fetched_at: AwareDatetime

    @model_validator(mode="after")
    def validate_rows(self) -> OfficialStandingsSnapshot:
        """Require all twenty unique clubs and authoritative positions."""
        if sorted(row.position for row in self.rows) != list(range(1, 21)):
            raise ValueError("incomplete official positions")
        if len({row.team.id for row in self.rows}) != 20:
            raise ValueError("duplicate official clubs")
        return self


class _NextData(HTMLParser):
    """Read one JSON data script without executing JavaScript or fetching linked assets."""

    def __init__(self) -> None:
        super().__init__()
        self.active = False
        self.scripts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script":
            self.active = dict(attrs).get("id") == "__NEXT_DATA__"

    def handle_data(self, data: str) -> None:
        if self.active:
            self.scripts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.active = False


def parse_official_standings(html: str, fetched_at: datetime) -> OfficialStandingsSnapshot:
    """Extract and validate the current LaLiga table from server-rendered page data.

    Args:
        html: Canonical official classification HTML.
        fetched_at: UTC retrieval timestamp.

    Returns:
        Overall classification and its explicitly published season.

    Raises:
        UnexpectedContentError: Missing, changed, or inconsistent source data.
    """
    try:
        parser = _NextData()
        parser.feed(html)
        if len(parser.scripts) != 1:
            raise ValueError("expected one official data script")
        props = json.loads(parser.scripts[0])["props"]["pageProps"]
        if props["competition"] != "primera-division":
            raise ValueError("wrong official competition")
        if not isinstance(props["season"], str) or not re.fullmatch(r"\d{4}", props["season"]):
            raise ValueError("invalid official season")
        rows = []
        for row in props["standings"]:
            difference = row["goal_difference"]
            if not isinstance(difference, str) or not re.fullmatch(r"[+-]?\d+", difference):
                raise ValueError("invalid official goal difference")
            rows.append(
                OfficialStanding(
                    team=OfficialClub(id=row["team"]["id"], name=row["team"]["nickname"]),
                    **{
                        key: row[key]
                        for key in (
                            "position",
                            "points",
                            "played",
                            "won",
                            "drawn",
                            "lost",
                            "goals_for",
                            "goals_against",
                        )
                    },
                    goal_difference=int(difference),
                )
            )
        return OfficialStandingsSnapshot(
            season=int(props["season"]),
            rows=rows,
            fetched_at=fetched_at,
        )
    except (ValueError, TypeError, KeyError):
        raise UnexpectedContentError("official standings returned invalid data") from None


class OfficialStandingsScraper:
    """Retrieve the official table with a one-hour cache and single-flight refresh."""

    def __init__(self, client: ScrapingHttpClient) -> None:
        self._client = client
        self._snapshot: OfficialStandingsSnapshot | None = None
        self._lock = asyncio.Lock()

    async def get_standings(self) -> OfficialStandingsSnapshot:
        """Return the cached or freshly parsed current-season table."""
        async with self._lock:
            now = datetime.now(UTC)
            if self._snapshot and (now - self._snapshot.fetched_at).total_seconds() < 3600:
                return self._snapshot
            response = await self._client.get(STANDINGS_URL)
            self._snapshot = parse_official_standings(response.text, datetime.now(UTC))
            return self._snapshot


def build_official_standings_scraper(
    settings: ScraperSettings,
) -> tuple[OfficialStandingsScraper, ScrapingHttpClient]:
    """Create a separate host client that respects LaLiga's 30-second crawl interval."""
    polite = settings.model_copy(update={"rate_per_s": 1 / 30, "burst": 1, "host_concurrency": 1})
    client = ScrapingHttpClient(polite, url_guard=allowed_standings_url, robots_url=ROBOTS_URL)
    return OfficialStandingsScraper(client), client
