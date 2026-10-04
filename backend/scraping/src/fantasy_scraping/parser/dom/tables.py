"""Generic row reading for tables described by a ``TableSpec``."""

from lxml.html import HtmlElement

from fantasy_scraping.parser.dom.document import HtmlDocument
from fantasy_scraping.parser.dom.locators import node_text


def row_nodes(document: HtmlDocument, selector: str, limit: int) -> list[HtmlElement]:
    """Return row elements, capped by ``limit``."""
    return document.css(selector)[:limit]


def cell_text(row: HtmlElement, selector: str) -> str:
    """Return the cleaned text of the first matching cell inside ``row``."""
    found = row.cssselect(selector)
    if not found:
        return ""
    return node_text(found[0])
