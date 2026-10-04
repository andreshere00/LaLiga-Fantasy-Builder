"""Enum tables for position, foot, risk, availability and hierarchy."""

import re

from fantasy_scraping.parser.normalise.text import casefold_key, clean_text

_POSITIONS = {
    "por": "POR",
    "portero": "POR",
    "def": "DEF",
    "defensa": "DEF",
    "med": "MED",
    "mediocampista": "MED",
    "centrocampista": "MED",
    "del": "DEL",
    "delantero": "DEL",
}
_FEET = {
    "izquierda": "left",
    "zurdo": "left",
    "derecha": "right",
    "diestro": "right",
    "ambas": "both",
    "ambidiestro": "both",
}
_RISK = {"bajo": "low", "media": "medium", "medio": "medium", "alto": "high"}
_AVAILABILITY = re.compile(
    r"^(disponible|duda|dudoso|lesionado|lesion|sancionado|baja)(?:\s+.*jornada\s+(\d+))?$",
    re.IGNORECASE,
)
_STATUS = {
    "disponible": "available",
    "duda": "doubtful",
    "dudoso": "doubtful",
    "lesionado": "injured",
    "lesion": "injured",
    "sancionado": "suspended",
    "baja": "injured",
}


def position_code(value: str) -> str | None:
    """Map a position tag to ``POR``, ``DEF``, ``MED`` or ``DEL``."""
    return _POSITIONS.get(casefold_key(value))


def foot(value: str) -> str | None:
    """Map a preferred-foot label to ``left``, ``right`` or ``both``."""
    return _FEET.get(casefold_key(value))


def risk_level(value: str) -> str | None:
    """Map a risk label to ``low``, ``medium`` or ``high``."""
    return _RISK.get(casefold_key(value))


def availability(value: str) -> tuple[str, int | None]:
    """Map an availability sentence to a status and an optional matchday.

    Args:
        value: Published label.

    Returns:
        ``(status, matchday)``. Unknown wording is ``unknown`` and the label
        is left for the caller to store.
    """
    text = clean_text(value)
    match = _AVAILABILITY.fullmatch(text)
    if match is None:
        jornada = re.search(r"jornada\s+(\d+)", text, re.IGNORECASE)
        matchday = int(jornada.group(1)) if jornada else None
        key = casefold_key(text).split(" ")[0] if text else ""
        return _STATUS.get(key, "unknown"), matchday
    status = _STATUS.get(casefold_key(match.group(1)), "unknown")
    matchday = int(match.group(2)) if match.group(2) else None
    return status, matchday


def hierarchy_rank(label: str, table: dict[str, int]) -> int | None:
    """Look up a hierarchy label. Unknown labels return ``None``."""
    return table.get(casefold_key(label))


def split_slash(value: str) -> list[str]:
    """Split ``Brasil / España`` in page order."""
    return [part.strip() for part in clean_text(value).split("/") if part.strip()]


def bid_amount(value: str) -> tuple[int | None, bool | None]:
    """Parse a profitable-bid cell.

    Returns:
        ``(amount, profitable)``. ``Sin rentabilidad`` is ``(None, False)``.
    """
    from fantasy_scraping.parser.normalise.numbers import es_int

    text = clean_text(value)
    if casefold_key(text) in {"sin rentabilidad", "no rentable"}:
        return None, False
    if not text or text == "—":
        return None, None
    return es_int(text), True
