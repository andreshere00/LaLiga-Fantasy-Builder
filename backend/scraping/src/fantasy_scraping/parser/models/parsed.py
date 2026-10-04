"""Dispatch result of ``ParserService.parse``."""

from typing import Literal

from fantasy_scraping.parser.models.base import ParserModel
from fantasy_scraping.parser.models.futbolfantasy import FutbolFantasyPlayer


class ParsedPlayer(ParserModel):
    """One parsed player. ``content_hash`` is not part of the hashed payload.

    Attributes:
        source: Always ``futbolfantasy``. FBref is not produced.
        futbolfantasy: Hierarchical player document.
        content_hash: SHA-256 of the canonical JSON without this field.
    """

    source: Literal["futbolfantasy"]
    futbolfantasy: FutbolFantasyPlayer
    content_hash: str
