"""CSS, XPath and Spanish-label locators."""

from lxml.html import HtmlElement

from fantasy_scraping.parser.dom.document import HtmlDocument
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text


def node_text(node: HtmlElement) -> str:
    """Clean the visible text of a node, including descendants."""
    return clean_text("".join(node.itertext()))


def apply_locator(
    document: HtmlDocument,
    locator: str,
    scope: HtmlElement | None = None,
) -> list[HtmlElement]:
    """Resolve one locator.

    Args:
        document: Parsed page.
        locator: ``css:``, ``xpath:`` or ``label:`` expression.
        scope: Optional subtree. Label search stays inside it.

    Returns:
        Matched elements. Label matches return the value cell, not the label.
    """
    if locator.startswith("css:"):
        return document.css(locator.removeprefix("css:"), scope)
    if locator.startswith("xpath:"):
        base = document.root if scope is None else scope
        return list(base.xpath(locator.removeprefix("xpath:")))
    if locator.startswith("label:"):
        return _label(document, locator.removeprefix("label:"), scope)
    return []


def _label(document: HtmlDocument, spec: str, scope: HtmlElement | None) -> list[HtmlElement]:
    label_text, _, scope_selector = spec.partition("|")
    key = casefold_key(label_text)
    base = document.root if scope is None else scope
    if scope_selector.startswith("css:"):
        scopes = document.css(scope_selector.removeprefix("css:"), base)
        base = scopes[0] if scopes else base
    for element in base.iter():
        if casefold_key(node_text(element)) != key:
            continue
        sibling = element.getnext()
        if sibling is not None:
            return [sibling]
    return []


def read_value(nodes: list[HtmlElement], read: str) -> str | None:
    """Read text, an attribute, or the match count from locator hits."""
    if read == "count":
        return str(len(nodes))
    if not nodes:
        return None
    if read.startswith("attr:"):
        return nodes[0].get(read.removeprefix("attr:"))
    return node_text(nodes[0])
