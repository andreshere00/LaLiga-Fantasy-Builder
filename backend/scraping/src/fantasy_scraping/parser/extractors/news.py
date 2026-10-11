"""News list."""

from __future__ import annotations

import re

from lxml.html import HtmlElement

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError
from fantasy_scraping.parser.extractors.base import ExtractionContext, http_url
from fantasy_scraping.parser.models.futbolfantasy import NewsItem
from fantasy_scraping.parser.normalise.dates import date_dmy


def extract_news(ctx: ExtractionContext) -> list[NewsItem]:
    """Read player news from ``#noticiasBox`` when present."""
    box = ctx.document.first("#noticiasBox")
    if box is not None:
        return _items_from_box(ctx, box)
    root = ctx.document.first(ctx.selector("news_root"))
    if root is None:
        ctx.miss("profile.news")
        return []
    return _items_from_list(ctx, root)


def _items_from_box(ctx: ExtractionContext, box: HtmlElement) -> list[NewsItem]:
    items: list[NewsItem] = []
    for node in box.cssselect("div.noticiaJugador"):
        if "lesionJugador" in (node.get("class") or ""):
            continue
        link = node.cssselect("a.link")
        if not link:
            continue
        url = http_url(ctx.page.url, link[0].get("href"))
        title = node_text(link[0])
        if url is None or not title:
            continue
        published = _published_box(ctx, node)
        items.append(NewsItem(title=title, url=url, published_on=published))
    return items


def _items_from_list(ctx: ExtractionContext, root: HtmlElement) -> list[NewsItem]:
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


def _published_box(ctx: ExtractionContext, node: HtmlElement) -> object:
    stamp = node.cssselect("div.date")
    if not stamp:
        return None
    raw = node_text(stamp[0])
    if not raw:
        return None
    return _date_from_day_month(ctx, raw)


def _date_from_day_month(ctx: ExtractionContext, raw: str) -> object:
    from datetime import date

    match = re.match(r"(\d{1,2})/(\d{1,2})", raw.strip())
    if not match:
        return None
    day = int(match.group(1))
    month = int(match.group(2))
    season = ctx.page.season_slug or ""
    year = _season_year_for_month(season, month)
    if year is None:
        try:
            return date_dmy(raw)
        except NormaliseError:
            return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _season_year_for_month(season_slug: str, month: int) -> int | None:
    match = re.search(r"(\d{2})-(\d{2})", season_slug)
    if not match:
        return None
    first = 2000 + int(match.group(1))
    second = 2000 + int(match.group(2))
    if month >= 9:
        return first
    if month <= 6:
        return second
    return first


def _published(node: object) -> object:
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
