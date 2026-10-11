"""Minutes cells."""

import re

from fantasy_scraping.parser.models.common import MinutesNote
from fantasy_scraping.parser.normalise.text import clean_text, map_minuses

_SALE = re.compile(r"^sale\s+(\d+)'?$", re.IGNORECASE)
_ENTRA = re.compile(r"^entra\s+(\d+)'?$", re.IGNORECASE)
_PLAIN = re.compile(r"^(\d+)'$")
_PREFIXED = re.compile(r"^.*?(\d+)'$")
_UNUSED = re.compile(r"^(no jug[oó]|suplente|banquillo|—|-)$", re.IGNORECASE)


def minutes_note(value: str, *, starter: bool) -> MinutesNote:
    """Parse a minutes cell.

    Args:
        value: Published text.
        starter: Whether the fixtures table marks the player as a starter.
            ``Sale N'`` stores ``N`` minutes only for starters.

    Returns:
        The note. Empty text is ``unknown``.
    """
    raw = clean_text(map_minuses(value))
    if not raw:
        return MinutesNote(raw="", event="unknown")
    sale = _SALE.fullmatch(raw)
    if sale is not None:
        minute = int(sale.group(1))
        return MinutesNote(
            raw=raw,
            event="subbed_off",
            minute=minute,
            minutes=minute if starter else None,
        )
    entra = _ENTRA.fullmatch(raw)
    if entra is not None:
        minute = int(entra.group(1))
        return MinutesNote(raw=raw, event="subbed_on", minute=minute, minutes=None)
    plain = _PLAIN.fullmatch(raw)
    if plain is not None:
        minute = int(plain.group(1))
        return MinutesNote(raw=raw, event="full", minute=minute, minutes=minute)
    prefixed = _PREFIXED.fullmatch(raw)
    if prefixed is not None and not sale and not entra:
        minute = int(prefixed.group(1))
        return MinutesNote(raw=raw, event="full", minute=minute, minutes=minute)
    if _UNUSED.fullmatch(raw):
        return MinutesNote(raw=raw, event="unused")
    return MinutesNote(raw=raw, event="unknown")
