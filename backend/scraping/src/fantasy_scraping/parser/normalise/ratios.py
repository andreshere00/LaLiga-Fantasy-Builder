"""Ratios and count-plus-percent cells."""

import re

from fantasy_scraping.parser.errors import NormaliseError
from fantasy_scraping.parser.models.common import CountPercent, Ratio
from fantasy_scraping.parser.normalise.numbers import es_int
from fantasy_scraping.parser.normalise.text import clean_text

_RATIO = re.compile(r"^(\d+)\s*/\s*(\d+)(?:\s*\((\d+)\s*%\))?$")
_COUNT_PERCENT = re.compile(r"^(\d+)\s*\((\d+)\s*%\)$")


def ratio(value: str) -> Ratio:
    """Parse ``16 / 25 (64 %)`` or ``3 / 3``.

    Args:
        value: Ratio cell.

    Returns:
        Numerator, denominator and optional percent.

    Raises:
        NormaliseError: The cell is not a ratio.
    """
    match = _RATIO.fullmatch(clean_text(value))
    if match is None:
        raise NormaliseError("invalid_ratio", "invalid ratio")
    percent = int(match.group(3)) if match.group(3) is not None else None
    return Ratio(
        numerator=int(match.group(1)),
        denominator=int(match.group(2)),
        percent=percent,
    )


def count_percent(value: str) -> CountPercent:
    """Parse ``7 (100 %)``.

    Args:
        value: Count cell.

    Returns:
        Count and percent.

    Raises:
        NormaliseError: The cell is not a count with a percent. A bare integer
        is accepted as a count with no percent.
    """
    text = clean_text(value)
    match = _COUNT_PERCENT.fullmatch(text)
    if match is not None:
        return CountPercent(count=int(match.group(1)), percent=int(match.group(2)))
    try:
        return CountPercent(count=es_int(text), percent=None)
    except NormaliseError as exc:
        raise NormaliseError("invalid_count", "invalid count percent") from exc
