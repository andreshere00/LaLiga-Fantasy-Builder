"""Navigation facts pulled from a profile page with lxml. Never statistics."""

import re

from cssselect import SelectorError
from lxml import etree
from lxml import html as lxml_html
from lxml.cssselect import CSSSelector

from fantasy_scraping.scraper.errors import InvalidRequestError, UnexpectedContentError
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


def extract_fragments(
    html: str, rules: dict[str, str], *, multiple: bool = True
) -> dict[str, list[str]]:
    """Return outer HTML for each CSS rule. Developer aid for writing parser fixtures.

    Args:
        html: Downloaded page.
        rules: Name to CSS selector.
        multiple: Keep every match (True) or only the first.

    Returns:
        Fragments per rule name.

    Raises:
        InvalidRequestError: A selector is not valid CSS.
        UnexpectedContentError: A selector matches nothing.
    """
    tree = lxml_html.fromstring(html)
    out: dict[str, list[str]] = {}
    for name, css in rules.items():
        try:
            nodes = CSSSelector(css)(tree)
        except (SelectorError, etree.XPathError) as exc:
            raise InvalidRequestError("invalid selector") from exc
        if not nodes:
            raise UnexpectedContentError()
        picked = nodes if multiple else nodes[:1]
        out[name] = [etree.tostring(n, encoding="unicode", method="html") for n in picked]
    return out
