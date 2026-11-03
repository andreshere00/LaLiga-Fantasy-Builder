"""Explicit season/league/minutes policy, separate from a verified percentile cohort."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field, model_validator

from fantasy_api.radar.views import comparison_index, coverage_summary, publication_id
from fantasy_api.schemas.player_radar import RadarQuery, RadarSnapshot

if TYPE_CHECKING:
    from fantasy_api.radar.releases import PublishedDataset


class RadarEligibility(BaseModel):
    """Reviewed current-season clubs and roster; unknown minutes never become zero."""

    model_config = ConfigDict(extra="forbid")
    season: str
    competition: str = Field(min_length=1)
    minimum_minutes: int = Field(ge=0)
    clubs: dict[str, list[str]]
    active_player_ids: list[str] = Field(max_length=10000)

    @model_validator(mode="after")
    def validate_scope(self) -> RadarEligibility:
        """Validate the season and require a nonempty reviewed club/roster scope."""
        RadarQuery(season=self.season)
        if (
            not self.clubs
            or not self.active_player_ids
            or any(not names for names in self.clubs.values())
        ):
            raise ValueError("club and active-roster evidence is required")
        if len(self.active_player_ids) != len(set(self.active_player_ids)) or any(
            not re.fullmatch(r"[0-9]{1,10}", value) for value in self.active_player_ids
        ):
            raise ValueError("active roster requires unique numeric master IDs")
        self.active_player_ids = sorted(self.active_player_ids, key=int)
        return self

    def exclusion(self, snapshot: RadarSnapshot, team_id: str | None) -> str | None:
        """Return an evidence-backed exclusion for an observation, or accept it."""
        if snapshot.season != self.season:
            return "season_unavailable"
        if (
            snapshot.player_id not in self.active_player_ids
            or snapshot.competition != self.competition
            or snapshot.club not in self.clubs.get(team_id or "", [])
        ):
            return "out_of_scope"
        if snapshot.minutes < self.minimum_minutes:
            return "insufficient_minutes"
        return None


def filter_publication(dataset: PublishedDataset, policy: RadarEligibility) -> PublishedDataset:
    """Filter served snapshots and rebuild coverage/index with hash-bound eligibility."""
    from fantasy_api.radar.releases import PublishedDataset

    if dataset.catalog.season != policy.season:
        raise ValueError("publication policy belongs to a different season")
    teams = {p.player_id: p.team_id for p in dataset.catalog.players}
    kept, rejected = [], {}
    for snapshot in dataset.store.snapshots:
        reason = policy.exclusion(snapshot, teams[snapshot.player_id])
        if reason:
            rejected.setdefault(snapshot.player_id, []).append(reason)
        else:
            kept.append(snapshot)
    if dataset.provenance is None:
        raise ValueError("revalidate a legacy release before applying eligibility")
    provenance = dict(dataset.provenance)
    provenance["format"] = "radar-provenance-v2"
    provenance["eligibility"] = policy.model_dump(mode="json")
    dataset_id = publication_id(
        dataset.catalog.snapshot_id,
        policy.season,
        provenance["task_hashes"],
        kept,
        provenance["eligibility"],
    )
    coverage = []
    for row in dataset.coverage:
        profiles = [s.profile for s in kept if s.player_id == row.player_id]
        changes = {"dataset_id": dataset_id, "available_profiles": profiles}
        if (
            row.player_id not in policy.active_player_ids
            or teams[row.player_id] not in policy.clubs
        ):
            changes.update(data_status="out_of_scope", reason_code="out_of_scope")
        elif not profiles and row.player_id in rejected:
            reason = (
                "out_of_scope"
                if "out_of_scope" in rejected[row.player_id]
                else rejected[row.player_id][0]
            )
            changes.update(data_status=reason, reason_code=reason)
        coverage.append(row.model_copy(update=changes))
    index = comparison_index(kept)
    ready = sum(r.data_status == "ready" for r in coverage)
    club_report = {}
    for team in policy.clubs:
        ids = {
            p.player_id
            for p in dataset.catalog.players
            if p.team_id == team and p.player_id in policy.active_player_ids
        }
        club_report[team] = {
            "active": len(ids),
            "ready": sum(r.data_status == "ready" and r.player_id in ids for r in coverage),
        }
    known_minutes = {
        s.player_id
        for s in dataset.store.snapshots
        if s.season == policy.season
        and s.competition == policy.competition
        and s.player_id in policy.active_player_ids
    }
    below_minimum = {
        s.player_id
        for s in dataset.store.snapshots
        if s.player_id in known_minutes and s.minutes < policy.minimum_minutes
    } - {s.player_id for s in kept}
    report = dataset.report | {
        "selection": {
            "active_roster": len(policy.active_player_ids),
            "published_qualifying": ready,
            "known_below_minimum": len(below_minimum),
            "unknown_minutes": len(set(policy.active_player_ids) - known_minutes),
        },
        "dataset_id": dataset_id,
        "ready": ready,
        "complete_radar_pct": round(100 * ready / len(coverage), 2),
        **coverage_summary(coverage, kept),
        "scope_by_team": club_report,
        "eligibility_policy": provenance["eligibility"],
        "by_club_coverage": {
            policy.clubs[t][0]: {"footballers": r["active"], "ready": r["ready"]}
            for t, r in club_report.items()
        },
        "eligible_known": 0,
        "eligible_coverage_pct": None,
        "eligible_unknown": len(coverage),
    }
    value = dataset.model_dump(mode="json") | {
        "store": {"snapshots": [s.model_dump(mode="json") for s in kept], "datamb_mappings": []},
        "coverage": [r.model_dump(mode="json") for r in coverage],
        "report": report,
        "index": {k: sorted(v) for k, v in index.items()},
        "provenance": provenance,
    }
    return PublishedDataset.model_validate(value)
