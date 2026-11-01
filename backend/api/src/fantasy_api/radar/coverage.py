"""Explicit catalog coverage, separate from provider identity and freshness."""

from __future__ import annotations

from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from fantasy_api.radar.profiles import PROFILES


class RadarCoverage(BaseModel):
    """One accounted master ID in a published season, with safe product reason codes."""

    model_config = ConfigDict(extra="forbid")
    player_id: str = Field(pattern=r"^[0-9]{1,10}$")
    season: str
    identity_status: Literal["pending_review", "matched", "ambiguous", "not_found"]
    data_status: Literal[
        "ready",
        "role_unresolved",
        "not_published",
        "insufficient_minutes",
        "incomplete_metrics",
        "out_of_scope",
        "season_unavailable",
    ]
    reason_code: Literal[
        "ready",
        "identity_pending",
        "identity_ambiguous",
        "identity_not_found",
        "role_unresolved",
        "not_published",
        "insufficient_minutes",
        "incomplete_metrics",
        "out_of_scope",
        "season_unavailable",
        "expired",
    ]
    default_profile: str | None = None
    available_profiles: list[str] = Field(default_factory=list)
    profile_errors: dict[str, str] = Field(default_factory=dict)
    last_success_at: AwareDatetime | None = None
    last_attempt_at: AwareDatetime | None = None
    last_error_code: str | None = None
    stale: bool = False
    dataset_id: str
    catalog_snapshot_id: str

    @model_validator(mode="after")
    def validate_profiles(self) -> RadarCoverage:
        """Keep selected roles inside the versioned registry."""
        roles = set(self.available_profiles) | set(self.profile_errors)
        if self.default_profile:
            roles.add(self.default_profile)
        if not roles.issubset(PROFILES):
            raise ValueError("unknown coverage role")
        return self
