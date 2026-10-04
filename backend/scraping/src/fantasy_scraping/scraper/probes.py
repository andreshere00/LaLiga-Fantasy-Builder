"""Navigation facts pulled from a profile page with lxml. Never statistics."""

import re
from collections.abc import Iterable

from cssselect import SelectorError
from lxml import etree
from lxml import html as lxml_html
from lxml.cssselect import CSSSelector

from fantasy_scraping.scraper.errors import InvalidRequestError, UnexpectedContentError
from fantasy_scraping.scraper.urls import COMPETITION_PREFIXES, SLUG_RE

_TEAM_HREF = re.compile(r"/equipos/([a-z0-9-]+)/?(?:[?#].*)?$")
_WIDGET_HREF = re.compile(r"/mercado/detalle/(\d+)")
_WIDGET_JS = re.compile(r"/analytics/laliga-fantasy/mercado/detalle/(\d+)", re.IGNORECASE)
_DATA_JUGADOR = re.compile(r"""data-jugador=["'](\d+)["']""", re.IGNORECASE)
_TEAM_ALIASES: dict[str, str] = {
    "atletico-de-madrid": "atletico",
    "athletic-club": "athletic",
    "real-betis": "betis",
    "deportivo-alaves": "alaves",
    "fc-barcelona": "barcelona",
}


def _canonical_team(slug: str) -> str:
    """Map a sitemap slug through the small alias table."""
    return _TEAM_ALIASES.get(slug, slug)


def team_slug(html: str) -> str | None:
    """Return the club slug from the profile header link, or None."""
    tree = lxml_html.fromstring(html)
    for node in tree.cssselect("a.club"):
        href = node.get("href") or ""
        if match := _TEAM_HREF.search(href):
            return match.group(1)
    return None


def matching_team_slugs(team_norm: str, team_slugs: Iterable[str]) -> list[str]:
    """Return sitemap team slugs that match the normalised free-text team name."""
    wanted = _canonical_team(team_norm)
    left = set(wanted.split("-"))
    matched: list[str] = []
    for slug in team_slugs:
        right = set(slug.split("-"))
        if left <= right or right <= left:
            matched.append(slug)
    return matched


def team_matches(team_norm: str, probed: str, team_slugs: Iterable[str]) -> bool:
    """Check the probed slug against one sitemap team match for ``team_norm``.

    Args:
        team_norm: Normalised free-text team name.
        probed: Slug found on the page.
        team_slugs: Known club slugs from the sitemap index.
    """
    matched = matching_team_slugs(team_norm, team_slugs)
    if len(matched) != 1:
        return False
    expected = matched[0]
    return probed == expected or _canonical_team(probed) == _canonical_team(expected)


def widget_id(html: str) -> str | None:
    """Return the market widget id from the profile header widget only."""
    tree = lxml_html.fromstring(html)
    for link in tree.cssselect("a.widget-mercado"):
        href = link.get("href") or ""
        if match := _WIDGET_HREF.search(href):
            return match.group(1)
    sections = tree.cssselect("section.mercado")
    if not sections:
        return None
    fragment = etree.tostring(sections[0], encoding="unicode")
    for value in sections[0].xpath(".//@data-jugador"):
        if value.isdigit():
            return value
    if match := _WIDGET_JS.search(fragment):
        return match.group(1)
    if match := _DATA_JUGADOR.search(fragment):
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
