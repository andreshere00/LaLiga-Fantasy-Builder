"""Supply gates bind seven ordered source columns to an explicitly reviewed role."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from fantasy_api.radar.files import content_id, read_json
from fantasy_api.radar.profiles import PROFILES
from fantasy_api.schemas.player_radar import (
    DataMBPlayer,
    ProfileId,
    RadarCohort,
    RadarQuery,
    RadarSnapshot,
)


class RoleAssignment(BaseModel):
    """A stable operator-approved role, independent of Fantasy's four positions."""

    model_config = ConfigDict(extra="forbid")
    profile: ProfileId
    default: bool = False
    audit_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    source_key: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,120}_stats[0-9]{0,3}$")
    evidence: str = Field(pattern=r"^https://[^\s]+$", max_length=1000)
    reviewed_at: AwareDatetime
    reviewer: str = Field(min_length=1, max_length=120)
    cohort: RadarCohort | None = None
    position_override_reason: str | None = Field(default=None, min_length=1, max_length=500)


class SupplyAudit(BaseModel):
    """Reviewed access, discovery and semantic mapping, bound to a captured JSON record."""

    model_config = ConfigDict(extra="forbid")
    audit_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    provider: Literal["datamb", "imported"]
    profile: ProfileId
    season: str
    source_position: str = Field(min_length=1, max_length=40)
    source_labels: list[str] = Field(min_length=7, max_length=7)
    metric_keys: list[str] = Field(min_length=7, max_length=7)
    recipe_version: str = Field(min_length=1, max_length=120)
    capture_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    evidence: list[str] = Field(min_length=1, max_length=20)
    reviewed_at: AwareDatetime
    reviewer: str = Field(min_length=1, max_length=120)
    access_approved: Literal[True]
    discovery_approved: Literal[True]
    definitions_approved: Literal[True]

    @model_validator(mode="after")
    def validate_columns(self) -> SupplyAudit:
        """Reject permuted, renamed or duplicate semantic mappings."""
        RadarQuery(season=self.season)
        if self.metric_keys != [key for key, _, _ in PROFILES[self.profile].metrics]:
            raise ValueError("source audit metric order does not match versioned profile")
        if len(set(self.source_labels)) != 7 or any(
            not label.strip() for label in self.source_labels
        ):
            raise ValueError("source audit requires seven distinct published column labels")
        return self

    def verify_capture(self, directory: Path) -> None:
        """Verify the audited immutable capture, its season and seven labels before use."""
        capture = read_json(directory / f"{self.audit_id}.json")
        if content_id(capture) != self.capture_hash:
            raise ValueError("audited capture changed")
        if self.provider == "datamb":
            row = DataMBPlayer.model_validate(capture)
            if (
                row.season != self.season
                or row.position != self.source_position
                or row.metric_labels != self.source_labels
            ):
                raise ValueError("capture does not match source audit")
        else:
            snapshot = RadarSnapshot.model_validate(capture)
            if (
                snapshot.season != self.season
                or snapshot.profile != self.profile
                or snapshot.recipe_version != self.recipe_version
                or [snapshot.source_metrics.get(k) for k in self.metric_keys] != self.source_labels
            ):
                raise ValueError("import capture does not match audited recipe and columns")


class SupplyAudits(BaseModel):
    """Only audited roles are eligible; missing roles remain explicitly blocked."""

    model_config = ConfigDict(extra="forbid")
    audits: list[SupplyAudit] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_ids(self) -> SupplyAudits:
        """Require unique stable audit references."""
        keys = [row.audit_id for row in self.audits]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate supply audit ID")
        return self

    def report(self, captures: Path) -> dict[str, object]:
        """Validate every capture and list validated and blocked profiles honestly."""
        for row in self.audits:
            row.verify_capture(captures)
        valid = sorted({row.profile for row in self.audits})
        return {
            "validated_profiles": valid,
            "blocked_profiles": sorted(set(PROFILES) - set(valid)),
            "audits": len(self.audits),
        }
