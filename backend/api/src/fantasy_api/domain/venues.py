"""Stadium venue directory."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).resolve().parent / "data" / "venues.json"


@dataclass(frozen=True, slots=True)
class VenueEntry:
    """One stadium row from the committed venue table."""

    club_key: str
    fantasy_id: int | None
    slug: str | None
    name: str
    stadium: str
    city: str
    country: str
    lat: float
    lon: float
    aliases: tuple[str, ...]


class VenueDirectory:
    """Resolve venues by Fantasy team id or club label."""

    def __init__(self, entries: tuple[VenueEntry, ...]) -> None:
        self._by_id = {entry.fantasy_id: entry for entry in entries if entry.fantasy_id is not None}
        self._by_alias: dict[str, VenueEntry] = {}
        for entry in entries:
            self._by_alias[entry.name.casefold()] = entry
            for alias in entry.aliases:
                self._by_alias[alias.casefold()] = entry

    @classmethod
    def load(cls) -> VenueDirectory:
        """Load the committed venue table."""
        raw = json.loads(_DATA.read_text(encoding="utf-8"))
        entries: list[VenueEntry] = []
        for row in raw:
            entries.append(
                VenueEntry(
                    club_key=str(row["club_key"]),
                    fantasy_id=int(row["fantasy_id"]) if row.get("fantasy_id") else None,
                    slug=row.get("slug"),
                    name=str(row["name"]),
                    stadium=str(row["stadium"]),
                    city=str(row["city"]),
                    country=str(row.get("country") or ""),
                    lat=float(row["lat"]),
                    lon=float(row["lon"]),
                    aliases=tuple(str(a) for a in row.get("aliases") or []),
                )
            )
        return cls(tuple(entries))

    def for_club(
        self,
        *,
        fantasy_id: int | None,
        name: str | None,
    ) -> VenueEntry | None:
        """Return a venue for a Fantasy id or label."""
        if fantasy_id is not None and fantasy_id in self._by_id:
            return self._by_id[fantasy_id]
        if name:
            return self._by_alias.get(name.casefold())
        return None


@lru_cache
def default_venue_directory() -> VenueDirectory:
    """Return a process-wide venue directory."""
    return VenueDirectory.load()
