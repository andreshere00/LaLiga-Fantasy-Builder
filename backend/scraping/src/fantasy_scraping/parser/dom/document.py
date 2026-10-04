"""Safe HTML parse. Scripts are data until they are removed."""

from lxml.html import HtmlElement, HTMLParser, fromstring

from fantasy_scraping.parser.models.common import JsonLdPerson, PartialParseWarning

_PARSER = HTMLParser(
    encoding="utf-8",
    remove_comments=False,
    remove_pis=True,
    no_network=True,
    huge_tree=False,
    recover=True,
)
_STRIP = ("script", "style", "noscript", "template", "iframe")


class HtmlDocument:
    """One parsed tree. CSS and XPath run against ``root``."""

    def __init__(self, root: HtmlElement, market_series_json: str | None = None) -> None:
        self.root = root
        self.market_series_json = market_series_json

    def css(self, selector: str, scope: HtmlElement | None = None) -> list[HtmlElement]:
        """Return matches in document order."""
        base = self.root if scope is None else scope
        return list(base.cssselect(selector))

    def first(self, selector: str, scope: HtmlElement | None = None) -> HtmlElement | None:
        """Return the first CSS match, if any."""
        found = self.css(selector, scope)
        return found[0] if found else None


def parse_html(html: str) -> tuple[HtmlDocument, JsonLdPerson | None, list[PartialParseWarning]]:
    """Parse HTML without fetching or executing scripts.

    Args:
        html: Page body.

    Returns:
        The document, the first person JSON-LD node, and reader warnings.
        Script, style, noscript, template and iframe nodes are removed after
        the JSON-LD blocks are read.
    """
    from fantasy_scraping.parser.dom.jsonld import read_jsonld

    root = fromstring(html.encode("utf-8"), parser=_PARSER)
    person, warnings = read_jsonld(root)
    series = None
    for node in root.cssselect("script.market-series"):
        if node.text and node.text.strip():
            series = node.text
            break
    for tag in _STRIP:
        for node in list(root.iter(tag)):
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
    return HtmlDocument(root, series), person, warnings
