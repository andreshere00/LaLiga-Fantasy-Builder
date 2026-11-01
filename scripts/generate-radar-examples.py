"""Generate explicit preview fixtures from the user's six records, without network access.

Run with backend/api/.venv/bin/python. Numeric ids and the import timestamp are
synthetic preview context, never mappings to Fantasy master ids.
"""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from fantasy_api.radar.profiles import PROFILES
from fantasy_api.schemas.player_radar import RadarSnapshot
from fantasy_api.services.player_radar import build_radar

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "frontend/src/features/players/radar/examples.json"
SAMPLES = [
    ("Pau Cubarsí", 19, 668, "defense_progression_v1", [99.7, 93.7, 90.5, 27, 34.6, 95.9, 92.4]),
    ("Xavi Espart", 19, 712, "defense_fullback_v1", [16.1, 61.9, 11.8, 44.6, 67.8, 75.9, 67.2]),
    ("Joan García", 25, 849, "goalkeeper_v1", [58, 81.2, 100, 42.8, 1.4, 36.2, 58]),
    ("Raphinha", 29, 712, "attacker_finishing_v1", [100, 90.7, 96.9, 33, 76.3, 98.5, 27.3]),
    ("Lamine Yamal", 19, 915, "attacker_winger_v1", [88.8, 96.2, 97.3, 98.6, 97, 98.4, 68.4]),
    ("Pedri", 23, 769, "midfielder_v1", [44.3, 55.7, 63.9, 87.9, 59.4, 84.8, 97.1]),
]


def main() -> None:
    """Write or check deterministic examples; never persist them to a live radar store."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    examples = []
    now = datetime(2026, 10, 30, tzinfo=UTC)
    for index, (name, age, minutes, profile, values) in enumerate(SAMPLES, start=1):
        warnings = ["Imported example. Identity and reference population are unverified."]
        if profile == "goalkeeper_v1":
            warnings.append(
                "Save% and PSxG-GA are both 58.0 in the supplied data; source check pending."
            )
        snapshot = RadarSnapshot(
            player_id=str(index),
            player=name,
            club="Barcelona",
            age=age,
            season="2026-27",
            competition="Unverified competition",
            period="supplied season sample",
            minutes=minutes,
            profile=profile,
            source="imported",
            method="user_supplied_percentile",
            recipe_version="supplied-example-v1",
            snapshot_id=f"preview-{index}",
            fetched_at=now,
            warnings=warnings,
            percentiles={
                key: value
                for (key, _, _), value in zip(PROFILES[profile].metrics, values, strict=True)
            },
        )
        examples.append(build_radar(snapshot, now=now).model_dump(mode="json"))
    output = json.dumps(examples, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if TARGET.read_text() != output:
            raise SystemExit("Radar examples are out of date")
    else:
        TARGET.write_text(output)


if __name__ == "__main__":
    main()
