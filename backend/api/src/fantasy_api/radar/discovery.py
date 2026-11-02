"""Scoped discovery queues from observed URLs; never infer identities from names."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, model_validator

from fantasy_api.radar.catalog import CatalogInventory
from fantasy_api.radar.registry import IdentityRegistry


class ObservedProfile(BaseModel):
    """An observed candidate reference, independent of identity approval."""

    model_config = ConfigDict(extra="forbid")
    player_id: str = Field(pattern=r"^[0-9]{1,10}$")
    url: str
    evidence: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_url(self) -> ObservedProfile:
        """Accept canonical observed player URLs only, never a supplied arbitrary host."""
        import re

        parts = urlsplit(self.url)
        if (
            parts.scheme != "https"
            or parts.netloc != "datamb.football"
            or parts.query
            or parts.fragment
            or not re.fullmatch(r"/[A-Za-z0-9_-]{1,120}_stats[0-9]{0,3}/", parts.path)
            or parts.path.endswith("_Team_stats/")
            or self.url not in self.evidence
        ):
            raise ValueError("expected an observed canonical DataMB player URL with evidence")
        return self


class DiscoveryManifest(BaseModel):
    """Bounded search observations; missing candidates remain unresolved."""

    model_config = ConfigDict(extra="forbid")
    profiles: list[ObservedProfile] = Field(default_factory=list, max_length=2000)


def discovery_report(
    catalog: CatalogInventory,
    registry: IdentityRegistry,
    manifest: DiscoveryManifest,
    team_ids: set[str],
) -> dict:
    """Account for every scoped master ID without automatically approving any candidate."""
    if not team_ids:
        raise ValueError("explicit team scope is required")
    current = registry.current()
    rows = []
    for player in catalog.players:
        if player.team_id not in team_ids:
            continue
        identity = current.get((player.player_id, catalog.season))
        urls = sorted({p.url for p in manifest.profiles if p.player_id == player.player_id})
        rows.append(
            {
                "player_id": player.player_id,
                "name": player.name,
                "team_id": player.team_id,
                "identity_status": identity.status if identity else "pending_review",
                "observed_urls": urls,
                "discovery_status": "observed" if urls else "no_observed_profile",
                "reason": None if urls else "No permitted profile observed; eligibility is unknown",
            }
        )
    if not rows or any(not any(p["team_id"] == team for p in rows) for team in team_ids):
        raise ValueError("team scope is missing from the catalog")
    return {
        "catalog_snapshot_id": catalog.snapshot_id,
        "season": catalog.season,
        "team_ids": sorted(team_ids),
        "accounted": len(rows),
        "players": rows,
    }


def weekly_slot(
    weekday: Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    *,
    now: datetime | None = None,
) -> tuple[str, bool]:
    """Return the Madrid calendar week and whether today is the configured extraction day."""
    local = (now or datetime.now(UTC)).astimezone(ZoneInfo("Europe/Madrid"))
    year, week, _ = local.isocalendar()
    return f"{year}-W{week:02d}", local.weekday() == (
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
        "sun",
    ).index(weekday)
