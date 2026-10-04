"""Stat line helpers."""

from fantasy_scraping.parser.models.stats import unavailable, unavailable_minutes


def test_unavailable_minutes_factory() -> None:
    line = unavailable_minutes()
    assert line.status == "unavailable"
    assert unavailable("test").reason == "test"
