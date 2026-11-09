"""Club changelog extractor."""

from __future__ import annotations

from datetime import datetime
from urllib.parse import urlparse

from lxml.html import HtmlElement, fromstring

from fantasy_scraping.models.page import ScrapedPage
from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.extractors.base import http_url
from fantasy_scraping.parser.models.club_page import (
    ClubNewsDocument,
    ClubNewsItem,
    ClubNewsKind,
    ClubNewsTarget,
)
from fantasy_scraping.parser.models.common import warning

# The page is one unpaginated feed of about a week; the cap only guards against a runaway page.
NEWS_LIMIT = 100

_KIND_BY_ICON: tuple[tuple[str, ClubNewsKind], ...] = (
    ("internacional", "national_team"),
    ("alineacion", "lineup"),
    ("list", "call_up"),
    ("lesionados", "injury_update"),
    ("dudas", "injury_update"),
    ("tocados", "injury_update"),
    ("icono_big_ok", "injury_update"),
)


def parse_club_news(page: ScrapedPage) -> ClubNewsDocument:
    """Parse every club changelog event on the page.

    Args:
        page: Saved ``ultimos-cambios`` HTML.

    Returns:
        Newest-first headlines with timestamps, event kind, link target, and URL. Article bodies
        are not read.
    """
    root = fromstring(page.html)
    items: list[ClubNewsItem] = []
    for link in root.cssselect(".changelog-feed a.event-link"):
        titles = link.cssselect(".event-title")
        title = node_text(titles[0]) if titles else ""
        url = http_url(page.url, link.get("href"))
        if not title or url is None:
            continue
        stamp = link.cssselect("time.event-time")
        published = _published(stamp[0].get("datetime")) if stamp else None
        items.append(
            ClubNewsItem(
                title=title,
                url=url,
                published_at=published,
                kind=_kind(link),
                target=_target(url),
            )
        )
        if len(items) == NEWS_LIMIT:
            break
    warnings = []
    if not items:
        warnings.append(
            warning(
                code="news_unpublished",
                section="news",
                path="items",
                rule_id="club.news",
                message="club changelog published no headlines",
            )
        )
    return ClubNewsDocument(slug=page.player_slug, items=items, warnings=warnings)


def _kind(link: HtmlElement) -> ClubNewsKind:
    for image in link.cssselect("img.event-icon"):
        name = (image.get("src") or "").rsplit("/", 1)[-1].casefold()
        for token, kind in _KIND_BY_ICON:
            if name.startswith(token):
                return kind
    return "other"


def _target(url: str) -> ClubNewsTarget:
    path = urlparse(url).path
    if path.startswith("/laliga/noticias/"):
        return "article"
    if path.startswith("/partidos/"):
        return "match"
    return "club"


def _published(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None
