"""Text to slug normalisation shared by queries and sitemap slugs."""

import re
import unicodedata

_EXTRA: dict[int, str] = str.maketrans(
    {"ø": "o", "ß": "ss", "đ": "d", "ł": "l", "æ": "ae", "œ": "oe", "ı": "i", "þ": "th"}
)
_DROPPED = re.compile(r"['’.]")
_NON_SLUG = re.compile(r"[^a-z0-9]+")
_SUFFIX = re.compile(r"-\d+$")


def normalise(text: str) -> str:
    """Fold text to the slug alphabet.

    Args:
        text: Free text such as a nickname.

    Returns:
        Lowercase ASCII words joined by single dashes. May be empty.
    """
    folded = unicodedata.normalize("NFKD", text).casefold().translate(_EXTRA)
    ascii_only = "".join(c for c in folded if not unicodedata.combining(c))
    return _NON_SLUG.sub("-", _DROPPED.sub("", ascii_only)).strip("-")


def base_slug(slug: str) -> str:
    """Drop a trailing numeric disambiguator (``lamine-gueye-1`` becomes ``lamine-gueye``)."""
    return _SUFFIX.sub("", slug)
