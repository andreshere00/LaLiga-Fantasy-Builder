"""Operator-reviewed provider identities; alias proposals never authorize ingestion."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from fantasy_api.radar.audits import RoleAssignment
from fantasy_api.radar.catalog import CatalogInventory
from fantasy_api.schemas.player_radar import RadarQuery

IdentityStatus = Literal["pending_review", "matched", "ambiguous", "not_found"]


class IdentityDecision(BaseModel):
    """Versioned evidence for one master identity and season, including past decisions."""

    model_config = ConfigDict(extra="forbid")
    player_id: str = Field(pattern=r"^[0-9]{1,10}$")
    season: str
    version: int = Field(ge=1)
    status: IdentityStatus
    provider: Literal["datamb", "imported"] = "datamb"
    source_key: str | None = Field(default=None, min_length=1, max_length=200)
    expected_name: str | None = Field(default=None, min_length=1, max_length=120)
    evidence: list[str] = Field(default_factory=list, max_length=20)
    reviewed_at: AwareDatetime | None = None
    reviewer: str | None = Field(default=None, min_length=1, max_length=120)
    valid_from: date | None = None
    valid_until: date | None = None
    roles: list[RoleAssignment] = Field(default_factory=list, max_length=6)
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def validate_decision(self) -> IdentityDecision:
        """Require traceable approval and canonical observed DataMB keys."""
        RadarQuery(season=self.season)
        profiles = [r.profile for r in self.roles]
        if len(profiles) != len(set(profiles)):
            raise ValueError("duplicate identity role")
        if self.roles and sum(r.default for r in self.roles) != 1:
            raise ValueError("exactly one reviewed default role is required")
        if self.roles and self.status != "matched":
            raise ValueError("roles require a matched identity")
        for evidence in self.evidence:
            url = urlsplit(evidence)
            if url.scheme not in {"https", "http"} or not url.netloc or url.username:
                raise ValueError("identity evidence must be a public reference URL")
        if self.valid_until and (not self.valid_from or self.valid_until < self.valid_from):
            raise ValueError("invalid identity validity interval")
        if self.status == "matched":
            if not all(
                (
                    self.source_key,
                    self.expected_name,
                    self.evidence,
                    self.reviewed_at,
                    self.reviewer,
                    self.valid_from,
                )
            ):
                raise ValueError("matched identity requires reviewed evidence")
            if self.provider == "datamb":
                import re

                if not re.fullmatch(r"[A-Za-z0-9_-]{1,120}_stats[0-9]{0,3}", self.source_key or ""):
                    raise ValueError("invalid observed DataMB key")
                url = f"https://datamb.football/{self.source_key}/"
                if url not in self.evidence:
                    raise ValueError("DataMB approval needs its canonical observed URL")
        return self


class IdentityRegistry(BaseModel):
    """Append-only decisions; a higher version supersedes, without deleting history."""

    model_config = ConfigDict(extra="forbid")
    records: list[IdentityDecision] = Field(default_factory=list, max_length=10000)

    @model_validator(mode="after")
    def validate_unique(self) -> IdentityRegistry:
        """Reject duplicate versions and source references assigned to two master IDs."""
        keys = [(r.player_id, r.season, r.version) for r in self.records]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate identity decision version")
        seen = set()
        for row in self.current().values():
            if row.status != "matched":
                continue
            key = (row.provider, row.source_key, row.season)
            if key in seen:
                raise ValueError(
                    "source identity assigned to multiple master IDs; review duplicates"
                )
            seen.add(key)
        return self

    def current(self) -> dict[tuple[str, str], IdentityDecision]:
        """Resolve the latest reviewed or pending decision for each identity and season."""
        rows: dict[tuple[str, str], IdentityDecision] = {}
        for row in self.records:
            key = (row.player_id, row.season)
            if key not in rows or row.version > rows[key].version:
                rows[key] = row
        return rows


def propose_identities(inventory: CatalogInventory, aliases: Any) -> list[dict[str, Any]]:
    """Export known names by exact master ID, retaining evidence without approving a provider.

    Args:
        inventory: Complete Fantasy catalog.
        aliases: Offline exported name inventory; no import from the scraping service.

    Returns:
        One review task per footballer. No URL or source key is inferred.
    """
    if not isinstance(aliases, dict) or not isinstance(aliases.get("players"), list):
        raise ValueError("expected offline player alias inventory")
    indexed = {}
    for row in aliases["players"]:
        if not isinstance(row, dict) or not str(row.get("id", "")).isdigit():
            raise ValueError("invalid alias identity")
        key = str(row["id"])
        if key in indexed:
            raise ValueError("duplicate alias identity")
        indexed[key] = row
    proposals = []
    for player in inventory.players:
        alias = indexed.get(player.player_id, {})
        proposals.append(
            {
                "player_id": player.player_id,
                "season": inventory.season,
                "status": "pending_review",
                "fantasy_name": player.name,
                "fantasy_club": player.club,
                "names": list(
                    dict.fromkeys(
                        n
                        for n in [player.name, alias.get("display_name"), alias.get("full_name")]
                        if isinstance(n, str)
                    )
                ),
                "name_evidence": alias.get("name_sources", []),
                "provider": "datamb",
                "source_key": None,
                "catalog_snapshot_id": inventory.snapshot_id,
            }
        )
    return proposals
