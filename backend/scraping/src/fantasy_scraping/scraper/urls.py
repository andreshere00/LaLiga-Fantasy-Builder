"""Single place for URL templates, season conversion and the SSRF allow-list."""

import re
from urllib.parse import urlsplit

from fantasy_scraping.scraper.errors import HostNotAllowedError, InvalidRequestError

HOST: str = "www.futbolfantasy.com"
BASE: str = f"https://{HOST}"
SLUG_RE: re.Pattern[str] = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SEASON_RE: re.Pattern[str] = re.compile(r"^\d{4}-\d{2}$")
ALLOWED_PREFIXES: tuple[str, ...] = (
    "/jugadores/",
    "/laliga/equipos/",
    "/analytics/laliga-fantasy/mercado/detalle/",
    "/sitemap",
    "/robots.txt",
)
COMPETITION_PREFIXES: tuple[str, ...] = (
    "champions-",
    "europa-league-",
    "conference-league-",
    "copa-del-rey-",
    "supercopa-",
)
ROBOTS_URL: str = f"{BASE}/robots.txt"
PLAYERS_SITEMAP_URL: str = f"{BASE}/sitemap-jugadores.xml"
TEAMS_SITEMAP_URL: str = f"{BASE}/sitemap-equipos.xml"


def check_slug(slug: str) -> str:
    """Validate a route slug.

    Raises:
        InvalidRequestError: The slug is not lowercase dash-separated ASCII.
    """
    if not SLUG_RE.fullmatch(slug):
        raise InvalidRequestError("invalid slug")
    return slug


def check_season(season: str) -> str:
    """Validate a ``2026-27`` season key.

    Raises:
        InvalidRequestError: The season does not match ``YYYY-YY``.
    """
    if not SEASON_RE.fullmatch(season):
        raise InvalidRequestError("invalid season")
    return season


def season_suffix(season: str) -> str:
    """Convert ``2026-27`` to the route suffix ``26-27``."""
    return check_season(season)[2:]


def laliga_slug(season: str) -> str:
    """Return the explicit LaLiga route segment, for example ``laliga-26-27``."""
    return f"laliga-{season_suffix(season)}"


def player_url(slug: str, season_slug: str) -> str:
    """Build a player page URL for one competition-season route."""
    return f"{BASE}/jugadores/{check_slug(slug)}/{check_slug(season_slug)}"


def widget_url(widget_id: str) -> str:
    """Build the market widget URL.

    Raises:
        InvalidRequestError: The id is not numeric.
    """
    if not widget_id.isdigit():
        raise InvalidRequestError("invalid widget id")
    return f"{BASE}/analytics/laliga-fantasy/mercado/detalle/{widget_id}?perfil=1"


def club_url(team_slug: str) -> str:
    """Build the club calendar URL."""
    return f"{BASE}/laliga/equipos/{check_slug(team_slug)}"


def assert_allowed_url(url: str) -> str:
    """Reject anything that is not an allow-listed FutbolFantasy URL.

    Args:
        url: Candidate URL, including redirect targets.

    Returns:
        The same URL when allowed.

    Raises:
        HostNotAllowedError: Scheme, host, port, userinfo or path is not allowed.
    """
    parts = urlsplit(url)
    lowered = parts.path.lower()
    if (
        parts.scheme != "https"
        or parts.hostname != HOST
        or parts.port not in (None, 443)
        or "@" in parts.netloc
        or ".." in parts.path
        or "%2f" in lowered
        or not lowered.startswith(ALLOWED_PREFIXES)
    ):
        raise HostNotAllowedError()
    return url
