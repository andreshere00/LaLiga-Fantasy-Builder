"""JSON-LD person extraction."""

from fantasy_scraping.parser.dom.jsonld import read_jsonld
from lxml.html import fromstring


def test_read_jsonld_person_with_graph_and_invalid_block() -> None:
    html = """
    <html><head>
    <script type="application/ld+json">{not json</script>
    <script type="application/ld+json">{
      "@graph": [
        {"@type": "WebSite", "name": "ignore"},
        {"@type": "Person", "name": " Ana ", "birthDate": "1996-12-14",
         "birthPlace": {"name": " Porto "}, "height": "176 cm",
         "nationality": ["Brasil", {"name": "España"}],
         "sameAs": ["javascript:alert(1)", "https://example.com/p"],
         "url": "https://example.com"}
      ]
    }</script>
    </head></html>
    """
    person, warnings = read_jsonld(fromstring(html))
    assert person is not None
    assert person.name == "Ana"
    assert person.birth_date is not None
    assert person.height_cm == 176
    assert person.birth_place == "Porto"
    assert "Brasil" in person.nationalities
    assert person.same_as == ["https://example.com/p"]
    assert any(item.code == "jsonld_invalid" for item in warnings)


def test_read_jsonld_returns_none_when_no_person() -> None:
    html = '<html><script type="application/ld+json">{"@type":"WebSite"}</script></html>'
    person, warnings = read_jsonld(fromstring(html))
    assert person is None
    assert warnings == []


def test_read_jsonld_list_payload_and_athlete_type() -> None:
    html = """
    <html><script type="application/ld+json">[
      {"@type": "Athlete", "name": "Z", "height": 180}
    ]</script></html>
    """
    person, _ = read_jsonld(fromstring(html))
    assert person is not None
    assert person.name == "Z"
    assert person.height_cm == 180


def test_read_jsonld_skips_invalid_birth_date() -> None:
    html = """
    <html><script type="application/ld+json">{
      "@type": "Person", "name": "X", "birthDate": "not-a-date"
    }</script></html>
    """
    person, _ = read_jsonld(fromstring(html))
    assert person is not None
    assert person.birth_date is None
