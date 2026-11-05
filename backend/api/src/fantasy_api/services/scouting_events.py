"""Pure event detection and scheduling; wall clocks alone never prove availability."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from fantasy_api.schemas.scouting import Observation, WatchWrite


def detect_events(
    previous: Observation | None,
    current: Observation,
    prefs: WatchWrite,
    now: datetime,
) -> tuple[Observation, list[tuple[str, str]], datetime]:
    """Compare confirmed observations and return idempotent events and next check."""
    events: list[tuple[str, str]] = []
    current.cycle = ":".join(
        (
            current.owner_id or "",
            current.player_team_id or "",
            current.unlock_at.isoformat() if current.unlock_at else "unknown",
        )
    )
    changed = previous is None or set(previous.listings) != set(current.listings)
    current.episode = uuid4().hex if changed else previous.episode
    if prefs.market_alert and previous is not None:
        if set(current.listings) - set(previous.listings):
            events.append(("market", current.episode))
    next_check = now + timedelta(minutes=5)
    eligible = (
        prefs.clause_alert
        and current.rival
        and current.clause_enabled
        and current.clause is not None
        and current.clause > 0
        and current.unlock_at is not None
    )
    if eligible:
        unlock = current.unlock_at
        assert unlock is not None
        warning = unlock - timedelta(hours=prefs.lead_hours)
        for threshold in (warning, unlock):
            if now < threshold < next_check:
                next_check = threshold
        if warning <= now < unlock and current.shielded is False:
            events.append(("clause_soon", current.cycle))
        if (
            current.available
            and previous is not None
            and (not previous.available or previous.cycle != current.cycle)
        ):
            events.append(("clause_available", current.cycle))
    return current, events, next_check
