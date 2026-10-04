"""Spanish integers, decimals, percents and signed deltas."""

import re
from decimal import Decimal

from fantasy_scraping.parser.errors import NormaliseError
from fantasy_scraping.parser.normalise.text import clean_text, map_minuses

_INT_GROUPS = re.compile(r"^[+-]?\d{1,3}(?:\.\d{3})+$")
_PLAIN_INT = re.compile(r"^[+-]?\d+$")
_DECIMAL = re.compile(r"^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d+$")
_PLAIN_DECIMAL = re.compile(r"^[+-]?\d+$")


def _prepare(value: str) -> str:
    return map_minuses(clean_text(value)).replace(" ", "")


def es_int(value: str) -> int:
    """Parse a Spanish integer. Dots are thousands separators.

    Args:
        value: Text such as ``172.907.890`` or ``−307.085``.

    Returns:
        The integer.

    Raises:
        NormaliseError: The grouping or the characters are not a Spanish integer.
    """
    text = _prepare(value)
    if "," in text or not (_INT_GROUPS.fullmatch(text) or _PLAIN_INT.fullmatch(text)):
        raise NormaliseError("invalid_number", "invalid spanish integer")
    return int(text.replace(".", ""))


def es_decimal(value: str) -> float:
    """Parse a Spanish decimal into a binary float via ``Decimal``.

    Args:
        value: Text such as ``16,71`` or ``−0,18``.

    Returns:
        The float value.

    Raises:
        NormaliseError: The text is not a Spanish decimal or integer.
    """
    text = _prepare(value)
    if _DECIMAL.fullmatch(text):
        whole, frac = text.split(",")
        normalized = whole.replace(".", "") + "." + frac
        return float(Decimal(normalized))
    if _PLAIN_DECIMAL.fullmatch(text):
        return float(Decimal(text))
    raise NormaliseError("invalid_number", "invalid spanish decimal")


def es_percent(value: str) -> float:
    """Parse a percent. ``64 %`` is ``64``, not ``0.64``.

    Args:
        value: Number, optional percent sign.

    Returns:
        The percent number.

    Raises:
        NormaliseError: The number cannot be parsed.
    """
    text = _prepare(value).removesuffix("%").strip()
    return es_decimal(text)


def es_int_token(value: str) -> int:
    """Parse the leading Spanish integer of a cell such as ``29 años`` or ``176 cm``.

    Args:
        value: Text that starts with an integer.

    Returns:
        The integer.

    Raises:
        NormaliseError: No integer starts the cell.
    """
    text = _prepare(value)
    matched = re.match(r"^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)", text)
    if matched is None:
        raise NormaliseError("invalid_number", "invalid spanish integer")
    return es_int(matched.group(0))


def signed_delta(value: str) -> int:
    """Parse a signed Spanish integer delta.

    Args:
        value: Text such as ``+1.658.150`` or ``−307.085``.

    Returns:
        The signed integer.

    Raises:
        NormaliseError: The text is not a signed integer.
    """
    return es_int(value)


def dash_decimal(value: str) -> float | None:
    """Parse a decimal, treating a dash as a missing number.

    Args:
        value: Cell text.

    Returns:
        The float, or ``None`` when the cell is ``—`` or empty.
    """
    text = clean_text(map_minuses(value))
    if text in {"", "-", "—"}:
        return None
    return es_decimal(text)
