"""Complete Fantasy master-ID inventory, independent of provider availability."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from fantasy_api.radar.files import content_id
from fantasy_api.schemas.payload import as_object_list
from fantasy_api.schemas.player_radar import RadarQuery
from fantasy_api.schemas.players import CatalogPlayer


class CatalogEntry(BaseModel):
    """One footballer or unresolved position; never a squad-entry identity."""

    model_config = ConfigDict(extra="forbid")
    player_id: str = Field(pattern=r"^[0-9]{1,10}$")
    name: str = Field(min_length=1, max_length=120)
    club: str = Field(min_length=1, max_length=120)
    team_id: str | None = None
    position_id: int | None = None
    position_review: bool = False


class CatalogInventory(BaseModel):
    """A validated full catalog with archived departures and a reproducible identity."""

    model_config = ConfigDict(extra="forbid")
    snapshot_id: str
    fetched_at: AwareDatetime
    season: str
    players: list[CatalogEntry] = Field(min_length=1, max_length=10000)
    excluded_coaches: list[str] = Field(default_factory=list)
    archived: list[CatalogEntry] = Field(default_factory=list)
    added: list[str] = Field(default_factory=list)
    changed: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_inventory(self) -> CatalogInventory:
        """Reject duplicate identities and invalid seasons in persisted inventories."""
        RadarQuery(season=self.season)
        ids = [p.player_id for p in self.players]
        if len(ids) != len(set(ids)) or set(ids).intersection(self.excluded_coaches):
            raise ValueError("duplicate catalog identity")
        if self.snapshot_id != content_id([p.model_dump() for p in self.players]):
            raise ValueError("catalog content hash mismatch")
        return self


def build_inventory(
    payload: Any,
    season: str,
    previous: CatalogInventory | None = None,
    *,
    minimum_count: int = 1,
    allow_large_removal: bool = False,
    now: datetime | None = None,
) -> CatalogInventory:
    """Validate a whole public catalog; retain unknown positions and departed history.

    Args:
        payload: Public Fantasy master catalog, never squad entries.
        season: Canonical season.
        previous: Last valid inventory for change detection and shrink protection.
        minimum_count: Operator's expected lower bound for the full catalog.
        allow_large_removal: Explicitly acknowledge removal of over ten percent.
        now: Optional observation time for deterministic jobs/tests.

    Returns:
        A complete inventory suitable for staging, or raises before replacement.
    """
    rows = as_object_list(payload)
    players, coaches, seen = [], [], set()
    for raw in rows:
        row = CatalogPlayer.model_validate(raw)
        player_id = str(row.id)
        if isinstance(raw.get("id"), bool) or not player_id.isascii() or not player_id.isdigit():
            raise ValueError("catalog requires numeric master IDs")
        if player_id in seen or "playerTeamId" in raw:
            raise ValueError("duplicate or squad-entry catalog identity")
        seen.add(player_id)
        if row.position_id == 5:
            coaches.append(player_id)
            continue
        players.append(
            CatalogEntry(
                player_id=player_id,
                name=row.nickname or row.name or "",
                club=str((row.team or {}).get("name") or "Unknown club"),
                team_id=str(row.team_id) if row.team_id is not None else None,
                position_id=row.position_id,
                position_review=row.position_id not in (1, 2, 3, 4),
            )
        )
    players.sort(key=lambda row: int(row.player_id))
    if len(players) < minimum_count:
        raise ValueError("catalog is below expected minimum")
    old = {row.player_id: row for row in previous.players} if previous else {}
    new = {row.player_id: row for row in players}
    removed = sorted(old.keys() - new.keys())
    if old and len(removed) > len(old) * 0.1 and not allow_large_removal:
        raise ValueError("catalog removed over ten percent; review before accepting")
    archived = {row.player_id: row for row in previous.archived} if previous else {}
    archived.update({key: old[key] for key in removed})
    for key in new:
        archived.pop(key, None)
    return CatalogInventory(
        snapshot_id=content_id([row.model_dump() for row in players]),
        fetched_at=now or datetime.now(UTC),
        season=season,
        players=players,
        excluded_coaches=sorted(coaches),
        archived=list(archived.values()),
        added=sorted(new.keys() - old.keys()),
        changed=sorted(key for key in new.keys() & old.keys() if new[key] != old[key]),
        removed=removed,
    )


def inventory_report(inventory: CatalogInventory) -> dict[str, Any]:
    """Account for every footballer, including unknown positions and absent data."""
    return {
        "catalog_snapshot_id": inventory.snapshot_id,
        "catalog_fetched_at": inventory.fetched_at.isoformat(),
        "footballers": len(inventory.players),
        "excluded_coaches": len(inventory.excluded_coaches),
        "position_review": sum(p.position_review for p in inventory.players),
        "by_position": dict(Counter(str(p.position_id) for p in inventory.players)),
        "by_club": dict(Counter(p.club for p in inventory.players)),
        "added": inventory.added,
        "changed": inventory.changed,
        "removed": inventory.removed,
    }
