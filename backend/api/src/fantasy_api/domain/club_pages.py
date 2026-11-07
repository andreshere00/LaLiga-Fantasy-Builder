"""FutbolFantasy page slugs for the current LaLiga clubs."""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_DATA_PATH = Path(__file__).resolve().parent / "data" / "futbolfantasy_club_slugs.json"
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


@dataclass(frozen=True, slots=True)
class FutbolFantasyClubPage:
    """One teams-master club with a verified FutbolFantasy slug."""

    team_id: int
    name: str
    slug: str


class FutbolFantasyClubPages:
    """Look up a FutbolFantasy club slug by teams-master id."""

    def __init__(self, clubs: Sequence[FutbolFantasyClubPage]) -> None:
        self._clubs = tuple(clubs)
        self._by_id = {club.team_id: club for club in self._clubs}

    @property
    def clubs(self) -> tuple[FutbolFantasyClubPage, ...]:
        """Return the verified clubs in file order."""
        return self._clubs

    def get(self, team_id: int) -> FutbolFantasyClubPage | None:
        """Return the club page for a teams-master id.

        Args:
            team_id: Public teams-master id.

        Returns:
            The verified page, or ``None`` when this season has no slug for that id.
        """
        return self._by_id.get(team_id)

    def slug_for(self, team_id: int) -> str | None:
        """Return the FutbolFantasy slug for a teams-master id.

        Args:
            team_id: Public teams-master id.

        Returns:
            The verified slug, or ``None`` when the club has no club page.
        """
        club = self.get(team_id)
        return club.slug if club else None


def _club_from_row(
    row: dict[str, object], seen_ids: set[int], seen_slugs: set[str]
) -> FutbolFantasyClubPage:
    """Validate one committed slug row."""
    team_id = int(row["team_id"])
    name = str(row["name"])
    slug = str(row["slug"])
    if team_id <= 0 or team_id in seen_ids or slug in seen_slugs or not _SLUG_RE.fullmatch(slug):
        raise ValueError("invalid futbolfantasy club slug row")
    if not name.strip():
        raise ValueError("invalid futbolfantasy club slug row")
    seen_ids.add(team_id)
    seen_slugs.add(slug)
    return FutbolFantasyClubPage(team_id=team_id, name=name, slug=slug)


@lru_cache
def load_futbolfantasy_club_pages() -> FutbolFantasyClubPages:
    """Load the committed teams-master id to FutbolFantasy slug map."""
    raw = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    rows = raw["clubs"]
    seen_ids: set[int] = set()
    seen_slugs: set[str] = set()
    clubs = [_club_from_row(row, seen_ids, seen_slugs) for row in rows]
    return FutbolFantasyClubPages(clubs)
