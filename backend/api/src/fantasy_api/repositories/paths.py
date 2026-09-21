"""Shared Fantasy competition path helpers."""

from __future__ import annotations

from urllib.parse import quote


def segment(value: str | int) -> str:
    """Percent-encode a path identifier so it cannot change the upstream path.

    Args:
        value: Raw path segment (league id, team id, etc.).

    Returns:
        URL-safe path segment.
    """
    return quote(str(value), safe="")


def competition_path(competition_id: int, *parts: str | int) -> str:
    """Build a competition-scoped Fantasy path under ``/api/v1/competition/{id}``.

    Args:
        competition_id: Fantasy competition id (typically ``1``).
        *parts: Additional path segments (already logical ids; encoded here).

    Returns:
        Absolute path starting with ``/api/v1/competition/...``.
    """
    encoded = "/".join(segment(part) for part in parts)
    base = f"/api/v1/competition/{competition_id}"
    return f"{base}/{encoded}" if encoded else base


def stats_week_path(competition_id: int, week: int) -> str:
    """Build the matchweek stats path under ``/stats/v1/competition/{id}/stats/week/...``.

    Args:
        competition_id: Fantasy competition id (typically ``1``).
        week: Matchweek number.

    Returns:
        Absolute path starting with ``/stats/v1/competition/...``.
    """
    return f"/stats/v1/competition/{competition_id}/stats/week/{segment(week)}"
