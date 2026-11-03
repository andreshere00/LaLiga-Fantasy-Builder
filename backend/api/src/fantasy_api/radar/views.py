"""Pure derived views shared by publication and integrity checks."""

from collections import Counter

from fantasy_api.radar.coverage import RadarCoverage
from fantasy_api.schemas.player_radar import RadarSnapshot


def comparison_index(snapshots: list[RadarSnapshot]) -> dict[str, list[str]]:
    """Index compatible observations with stable ordering."""
    from fantasy_api.services.player_radar import build_radar

    index: dict[str, list[str]] = {}
    for snapshot in snapshots:
        key = build_radar(snapshot).comparison_key
        if key:
            index.setdefault(key, []).append(f"{snapshot.player_id}:{snapshot.profile}")
    return {key: sorted(values) for key, values in index.items()}


def coverage_summary(coverage: list[RadarCoverage], snapshots: list[RadarSnapshot]) -> dict:
    """Summarize shared coverage counts without changing eligibility semantics."""
    return {
        "ready": sum(row.data_status == "ready" for row in coverage),
        "by_role": dict(Counter(s.profile for s in snapshots)),
        "reasons": dict(Counter(row.reason_code for row in coverage)),
    }


def publication_id(
    catalog_id: str,
    season: str,
    task_hashes: list[str],
    snapshots: list[RadarSnapshot],
    eligibility: dict | None = None,
) -> str:
    """Hash the canonical publication inputs, preserving v1 and v2 identities."""
    from fantasy_api.radar.files import content_id

    payload = {
        "catalog": catalog_id,
        "season": season,
        "tasks": sorted(task_hashes),
        "observations": sorted(snapshot.snapshot_id for snapshot in snapshots),
    }
    if eligibility is not None:
        payload["eligibility"] = eligibility
    return content_id(payload)
