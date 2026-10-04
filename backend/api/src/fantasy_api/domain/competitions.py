"""Competition classification from free-text labels."""

from __future__ import annotations

import re
import unicodedata

from fantasy_api.schemas.player_stats import Competition

_STRIP_RE = re.compile(r"[^\w\s]", re.UNICODE)


def normalise_competition_label(raw: str) -> str:
    """Casefold and strip accents/punctuation from a competition label."""
    text = unicodedata.normalize("NFKD", raw)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _STRIP_RE.sub(" ", text.casefold())
    return " ".join(text.split())


def classify_competition(raw: str | None) -> Competition:
    """Map a scraped competition label to a canonical enum value.

    Args:
        raw: Raw label from FutbolFantasy or Fantasy calendar.

    Returns:
        Classified competition; unknown labels become ``other``.
    """
    if not raw or not raw.strip():
        return Competition.OTHER
    norm = normalise_competition_label(raw)
    if "conference" in norm or "conf lg" in norm or "uecl" in norm:
        return Competition.CONFERENCE_LEAGUE
    if "champions" in norm or "ucl" in norm:
        return Competition.CHAMPIONS_LEAGUE
    if "europa league" in norm or "europa lg" in norm or norm == "uel":
        return Competition.EUROPA_LEAGUE
    if "copa del rey" in norm:
        return Competition.COPA_DEL_REY
    if "supercopa" in norm and "europa" not in norm and "uefa" not in norm:
        return Competition.SUPERCOPA
    if any(token in norm for token in ("la liga", "laliga", "primera division", "ea sports")):
        return Competition.LALIGA
    return Competition.OTHER
