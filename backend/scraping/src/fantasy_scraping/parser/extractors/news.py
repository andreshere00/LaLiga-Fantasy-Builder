"""News list."""

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError
from fantasy_scraping.parser.extractors.base import ExtractionContext, http_url
from fantasy_scraping.parser.models.futbolfantasy import NewsItem
from fantasy_scraping.parser.normalise.dates import date_dmy


def extract_news(ctx: ExtractionContext) -> list[NewsItem]:
    """Read news items. A missing container is recorded in ``missing``.

    Args:
        ctx: Extraction context.

    Returns:
        News items in page order. An empty container returns an empty list
        without a missing-path entry.
    """
    root = ctx.document.first(ctx.selector("news_root"))
    if root is None:
        ctx.miss("profile.news")
        return []
    items: list[NewsItem] = []
    for node in ctx.document.css(ctx.selector("news_item")):
        link = node.cssselect("a")
        if not link:
            continue
        url = http_url(ctx.page.url, link[0].get("href"))
        title = node_text(link[0])
        if url is None or not title:
            continue
        published = _published(node)
        source_node = node.cssselect(".fuente")
        summary_node = node.cssselect(".resumen")
        items.append(
            NewsItem(
                title=title,
                url=url,
                published_on=published,
                source=node_text(source_node[0]) if source_node else None,
                summary=node_text(summary_node[0]) if summary_node else None,
            )
        )
    return items


def _published(node: object) -> object:
    from lxml.html import HtmlElement

    if not isinstance(node, HtmlElement):
        return None
    stamp = node.cssselect("time")
    if not stamp:
        return None
    raw = stamp[0].get("datetime") or node_text(stamp[0])
    if not raw:
        return None
    if len(raw) >= 10 and raw[4] == "-":
        from datetime import date

        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            return None
    try:
        return date_dmy(raw)
    except NormaliseError:
        return None
