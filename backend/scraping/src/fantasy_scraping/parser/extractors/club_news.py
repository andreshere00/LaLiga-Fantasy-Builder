"""Club changelog extractor."""

from __future__ import annotations

from datetime import datetime

from lxml.html import fromstring

from fantasy_scraping.models.page import ScrapedPage
from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.extractors.base import http_url
from fantasy_scraping.parser.models.club_page import ClubNewsDocument, ClubNewsItem
from fantasy_scraping.parser.models.common import warning

NEWS_LIMIT = 5


def parse_club_news(page: ScrapedPage) -> ClubNewsDocument:
    """Parse the five newest club changelog headlines.

    Args:
        page: Saved ``ultimos-cambios`` HTML.

    Returns:
        Headlines, timestamps, and article URLs. Article bodies are not read.
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
        items.append(ClubNewsItem(title=title, url=url, published_at=published))
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


def _published(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None
