"""Whitespace and comparison keys. No locale."""

import unicodedata

_QUOTES = str.maketrans({"’": "'", "‘": "'", "´": "'"})
_MINUSES = str.maketrans({"−": "-", "–": "-", "—": "-"})


def clean_text(value: str) -> str:
    """NFKC, map curly quotes, collapse whitespace."""
    text = unicodedata.normalize("NFKC", value).translate(_QUOTES)
    return " ".join(text.split())


def strip_accents(value: str) -> str:
    """Drop combining marks after NFKD."""
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def casefold_key(value: str) -> str:
    """Accent-insensitive key used to match Spanish labels."""
    return strip_accents(clean_text(value)).casefold()


def map_minuses(value: str) -> str:
    """Map unicode minus and dashes to ASCII ``-``."""
    return value.translate(_MINUSES)
