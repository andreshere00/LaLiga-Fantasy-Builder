"""Player header text from FutbolFantasy markup variants."""

import re

from fantasy_scraping.parser.normalise.numbers import es_int
from fantasy_scraping.parser.normalise.text import clean_text

_SHIRT_DOT_NAME = re.compile(r"^(\d+)\.\s*(.+)$")


def player_display_name(value: str) -> str:
    """Strip a leading shirt number from ``h1.jugador-nombre`` text."""
    text = clean_text(value)
    match = _SHIRT_DOT_NAME.match(text)
    if match:
        return match.group(2)
    return text


def data_local_side(value: str) -> str:
    """Map ``data-local`` on live fixture rows to home or away tokens."""
    token = clean_text(value)
    if token in {"1", "Sí", "Si", "sí", "si"}:
        return "home"
    if token in {"0", "No", "no"}:
        return "away"
    return token


def player_shirt_number(value: str) -> int:
    """Read shirt from ``h1 .shirt`` or ``11. Name`` heading text."""
    text = clean_text(value)
    match = _SHIRT_DOT_NAME.match(text)
    if match:
        return int(match.group(1))
    return es_int(text)
