"""Validated football radar snapshots; no Fantasy points or inferred percentiles."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from fantasy_api.radar.coverage import RadarCoverage
from fantasy_api.radar.profiles import PROFILES
from fantasy_api.schemas.common import FlexibleModel

ProfileId = Literal[
    "defense_progression_v1",
    "defense_fullback_v1",
    "goalkeeper_v1",
    "attacker_finishing_v1",
    "attacker_winger_v1",
    "midfielder_v1",
]
Percentile = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False, strict=True)]


class RadarQuery(BaseModel):
    """Independent radar selection; never accepts an upstream URL or user id."""

    model_config = ConfigDict(extra="forbid")
    season: str = Field(pattern=r"^20\d{2}-\d{2}$")
    profile: ProfileId | None = None
    compare_player_id: str | None = Field(default=None, pattern=r"^[0-9]{1,10}$")

    @model_validator(mode="after")
    def validate_season(self) -> RadarQuery:
        """Reject seasons whose end year does not follow their start year."""
        if int(self.season[-2:]) != (int(self.season[:4]) + 1) % 100:
            raise ValueError("invalid season")
        return self


class RadarCohort(FlexibleModel):
    """Published or documented population; unknown fields remain explicitly absent."""

    id: str = Field(min_length=1, max_length=200)
    label: str = Field(min_length=1, max_length=300)
    reference_snapshot: str = Field(min_length=1, max_length=200)
    eligibility: str = Field(min_length=1, max_length=300)
    size: int | None = Field(default=None, ge=1)
    minimum_minutes: int | None = Field(default=None, ge=0)


class RadarSnapshot(FlexibleModel):
    """Portable, durable input to the radar service, bound to a verified master id."""

    player_id: str = Field(pattern=r"^[0-9]{1,10}$")
    player: str = Field(min_length=1, max_length=120)
    club: str = Field(min_length=1, max_length=120)
    age: int | None = Field(default=None, ge=0, le=100)
    season: str = Field(pattern=r"^20\d{2}-\d{2}$")
    competition: str = Field(min_length=1, max_length=120)
    period: str = Field(min_length=1, max_length=120)
    minutes: int = Field(ge=0)
    profile: ProfileId
    source: Literal["imported", "datamb", "application"]
    method: str = Field(min_length=1, max_length=120)
    recipe_version: str = Field(min_length=1, max_length=120)
    snapshot_id: str = Field(min_length=1, max_length=200)
    fetched_at: AwareDatetime
    data_as_of: AwareDatetime | None = None
    cohort: RadarCohort | None = None
    percentiles: dict[str, Percentile | None]
    stale: bool = False
    source_metrics: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_profile(self) -> RadarSnapshot:
        """Require all seven named axes, including explicit nulls for missing values."""
        expected = {metric[0] for metric in PROFILES[self.profile].metrics}
        if self.percentiles.keys() != expected:
            raise ValueError("radar metrics do not match the selected profile")
        if self.source_metrics and self.source_metrics.keys() != expected:
            raise ValueError("invalid source metric references")
        RadarQuery(season=self.season)
        return self


class RadarAxis(FlexibleModel):
    """One ordered percentile and its source-specific semantic reference."""

    key: str
    label: str
    definition: str
    percentile: Percentile | None
    source: str
    source_metric: str
    status: Literal["available", "not_published"]


class PlayerRadar(FlexibleModel):
    """Ready-to-render radar; compatibility is assigned by the application service."""

    player_id: str
    player: str
    club: str
    age: int | None
    season: str
    competition: str
    period: str
    minutes: int
    profile: ProfileId
    profile_label: str
    position: Literal["Defense", "Goalkeeper", "Attacker", "Midfielder"]
    source: str
    method: str
    recipe_version: str
    snapshot_id: str
    fetched_at: AwareDatetime
    data_as_of: AwareDatetime | None
    cohort: RadarCohort | None
    axes: list[RadarAxis] = Field(min_length=7, max_length=7)
    comparison_key: str | None
    comparison_reason: str | None
    stale: bool
    warnings: list[str]


class RadarCandidate(FlexibleModel):
    """A player with a cached, compatible and complete reference snapshot."""

    player_id: str
    player: str
    club: str | None = None
    profile: ProfileId


class RadarResponse(FlexibleModel):
    """Independent optional segment with honest missing and comparison states."""

    player_id: str
    season: str
    available_seasons: list[str]
    status: Literal["available", "unavailable"]
    reason: str | None
    radars: list[PlayerRadar]
    coverage: RadarCoverage | None = None
    default_profile: ProfileId | None = None
    compatible_players: list[RadarCandidate] = Field(default_factory=list)
    comparison: PlayerRadar | None = None
    comparison_reason: str | None = None


class DataMBMapping(FlexibleModel):
    """Operator-reviewed identity and column mapping; never derived from fuzzy names."""

    player_id: str = Field(pattern=r"^[0-9]{1,10}$")
    profile: ProfileId
    profile_key: str = Field(pattern=r"^[A-Za-z0-9_-]{1,120}_stats$")
    expected_name: str = Field(min_length=1, max_length=120)
    source_position: str = Field(min_length=1, max_length=40)
    source_labels: list[str] = Field(min_length=7, max_length=7)
    identity_verified: Literal[True]
    cohort: RadarCohort | None = None


class RadarStore(FlexibleModel):
    """Explicit configured datasets; never ships sample identities into player profiles."""

    snapshots: list[RadarSnapshot] = Field(default_factory=list, max_length=10000)
    datamb_mappings: list[DataMBMapping] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def validate_unique(self) -> RadarStore:
        """Reject ambiguous active records and competing sources for the same profile."""
        keys = [(s.player_id, s.season, s.profile) for s in self.snapshots]
        mapping_keys = [(m.player_id, m.profile) for m in self.datamb_mappings]
        if len(keys) != len(set(keys)) or len(mapping_keys) != len(set(mapping_keys)):
            raise ValueError("duplicate radar identity")
        if any((s.player_id, s.profile) in mapping_keys for s in self.snapshots):
            raise ValueError("ambiguous radar source")
        return self


class DataMBPlayer(FlexibleModel):
    """Validated wire snapshot from the private DataMB adapter."""

    name: str
    club: str
    league: str
    age: int = Field(ge=0, le=100)
    position: str
    season: str
    minutes: int = Field(ge=0)
    percentiles: list[Percentile] = Field(min_length=7, max_length=7)
    metric_labels: list[str] = Field(min_length=7, max_length=7)
    fetched_at: AwareDatetime
    stale: bool = False
