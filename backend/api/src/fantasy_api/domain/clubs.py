"""Club identity matching across Fantasy and FutbolFantasy labels."""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_ALIASES_PATH = Path(__file__).resolve().parent / "data" / "club_aliases.json"
_STRIP_TOKENS = frozenset(
    {
        "fc",
        "cf",
        "cd",
        "ud",
        "rcd",
        "real",
        "sd",
        "rc",
        "club",
        "deportivo",
        "atletico",
        "athletic",
    }
)
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


@dataclass(frozen=True, slots=True)
class Club:
    """One club from teams-master or the venue table."""

    club_id: int
    name: str
    short_name: str | None
    slug: str | None


def _normalise_label(label: str) -> str:
    text = unicodedata.normalize("NFKD", label)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _PUNCT.sub(" ", text.casefold())
    parts = [part for part in text.split() if part not in _STRIP_TOKENS]
    return " ".join(parts)


class ClubDirectory:
    """Match club labels to Fantasy team ids."""

    def __init__(
        self,
        teams_master: Sequence[Mapping[str, object]],
        laliga_ids: frozenset[int],
        aliases: Mapping[str, str],
    ) -> None:
        self._laliga_ids = laliga_ids
        self._by_id: dict[int, Club] = {}
        self._short: dict[str, Club] = {}
        self._name: dict[str, Club] = {}
        self._aliases = {k.casefold(): v for k, v in aliases.items()}
        for row in teams_master:
            try:
                club_id = int(row.get("id") or row.get("dspId") or 0)
            except (TypeError, ValueError):
                continue
            if club_id <= 0:
                continue
            name = str(row.get("name") or "")
            short = row.get("shortName")
            short_name = str(short) if short else None
            slug = row.get("slug")
            club = Club(
                club_id=club_id,
                name=name,
                short_name=short_name,
                slug=str(slug) if slug else None,
            )
            self._by_id[club_id] = club
            if short_name and club_id in laliga_ids:
                self._short.setdefault(short_name.casefold(), club)
            norm = _normalise_label(name)
            if norm:
                self._name.setdefault(norm, club)

    def by_id(self, club_id: int) -> Club | None:
        """Return a club by Fantasy team id."""
        return self._by_id.get(club_id)

    def match(self, label: str, *, prefer_laliga: bool = True) -> Club | None:
        """Match a short code or club name to a Fantasy team."""
        text = label.strip()
        if not text:
            return None
        short_hit = self._short.get(text.casefold())
        if short_hit:
            return short_hit
        norm = _normalise_label(text)
        name_hit = self._name.get(norm)
        if name_hit:
            return name_hit
        alias_target = self._aliases.get(text.casefold())
        if alias_target:
            return self.match(alias_target, prefer_laliga=prefer_laliga)
        return None


@lru_cache
def load_alias_map() -> dict[str, str]:
    """Load committed club alias overrides."""
    if not _ALIASES_PATH.is_file():
        return {}
    data = json.loads(_ALIASES_PATH.read_text(encoding="utf-8"))
    return {str(k): str(v) for k, v in data.items()}
