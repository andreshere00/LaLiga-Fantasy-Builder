"""Navigation facts pulled from a profile page with lxml. Never statistics."""

import re

from lxml import html as lxml_html

from fantasy_scraping.scraper.urls import COMPETITION_PREFIXES, SLUG_RE

_TEAM_HREF = re.compile(r"/equipos/([a-z0-9-]+)/?(?:[?#].*)?$")
_WIDGET_HREF = re.compile(r"/mercado/detalle/(\d+)")
_TEAM_ALIASES: dict[str, str] = {
    "atletico-de-madrid": "atletico",
    "athletic-club": "athletic",
    "real-betis": "betis",
    "deportivo-alaves": "alaves",
    "fc-barcelona": "barcelona",
}


def team_slug(html: str) -> str | None:
    """Return the slug of the first ``/equipos/{slug}`` link, or None."""
    tree = lxml_html.fromstring(html)
    for href in tree.xpath("//a/@href"):
        if match := _TEAM_HREF.search(href):
            return match.group(1)
    return None


def team_matches(team: str, probed: str) -> bool:
    """Check a normalised team name against a probed team slug.

    Args:
        team: Normalised free-text team name.
        probed: Slug found on the page.
    """
    wanted = _TEAM_ALIASES.get(team, team)
    left, right = set(wanted.split("-")), set(probed.split("-"))
    return left <= right or right <= left


def widget_id(html: str) -> str | None:
    """Return the numeric market widget id from ``data-jugador`` or a widget link."""
    tree = lxml_html.fromstring(html)
    for value in tree.xpath("//@data-jugador"):
        if value.isdigit():
            return value
    for href in tree.xpath("//@href | //@data-url | //@src"):
        if match := _WIDGET_HREF.search(href):
            return match.group(1)
    return None


def competition_slugs(html: str, season_label: str) -> list[str]:
    """List club-competition route slugs offered for the current season.

    Args:
        html: Profile page.
        season_label: Label such as ``2026/27`` matched against ``data-nombre-temporada``.

    Returns:
        Slugs in document order, without duplicates.
    """
    tree = lxml_html.fromstring(html)
    slugs: list[str] = []
    for option in tree.xpath("//option[@data-nombre-temporada]"):
        value = (option.get("value") or "").rstrip("/").rsplit("/", 1)[-1]
        if (
            option.get("data-nombre-temporada", "").strip() == season_label
            and SLUG_RE.fullmatch(value)
            and value.startswith(COMPETITION_PREFIXES)
            and value not in slugs
        ):
            slugs.append(value)
    return slugs
