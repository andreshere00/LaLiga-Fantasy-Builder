"""Locator and formatter edges."""

from datetime import date

from fantasy_scraping.parser.dom.document import HtmlDocument
from fantasy_scraping.parser.dom.locators import apply_locator, read_value
from fantasy_scraping.parser.markdown.formatters import (
    fmt_date,
    fmt_duration,
    fmt_minutes,
    fmt_percent,
)
from fantasy_scraping.parser.markdown.tables import cell
from lxml.html import fromstring


def test_label_locator_reads_sibling_value() -> None:
    document = HtmlDocument(fromstring("<dl><dt>Nombre</dt><dd>Ana</dd></dl>"))
    nodes = apply_locator(document, "label:Nombre")
    assert read_value(nodes, "text") == "Ana"
    assert apply_locator(document, "xpath://dd")[0].text == "Ana"
    assert read_value(apply_locator(document, "css:dd"), "count") == "1"
    assert apply_locator(document, "bogus:x") == []


def test_formatters_cover_duration_percent_and_empty_cell() -> None:
    assert fmt_duration(1) == "1 día"
    assert fmt_percent(64.2, 0) == "64 %"
    assert fmt_percent(64.25, 2) == "64,25 %"
    assert fmt_minutes("Entra 62'", None, "subbed_on") == "Entra 62'"
    assert fmt_minutes("", None, "unknown") == "—"
    assert fmt_date(date(2026, 10, 4), "iso") == "2026-10-04"
    assert cell("") == "—"
