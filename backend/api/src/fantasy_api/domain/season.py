"""Current-season helpers (July 1 boundary)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True, slots=True)
class Season:
    """Football season label and FutbolFantasy slug."""

    label: str
    start: date
    futbolfantasy_slug: str


def current_season(today: date) -> Season:
    """Return the season containing ``today``.

    Args:
        today: Calendar date (typically Europe/Madrid).

    Returns:
        Season with display label and FutbolFantasy slug.
    """
    if today.month >= 7:
        start_year = today.year
    else:
        start_year = today.year - 1
    end_yy = (start_year + 1) % 100
    return Season(
        label=f"{start_year}/{end_yy:02d}",
        start=date(start_year, 7, 1),
        futbolfantasy_slug=f"{str(start_year)[2:]}-{end_yy:02d}",
    )
