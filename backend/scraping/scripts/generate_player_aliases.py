"""Regenerate aliases from the reviewed public player identity inventory."""

import json
from pathlib import Path

from fantasy_scraping.scraper.name_aliases import build_player_alias_records


def main() -> None:
    """Generate grouped player records and preserve explicit unavailable routes."""
    data = Path(__file__).resolve().parents[1] / "src/fantasy_scraping/scraper/data"
    inventory = json.loads((data / "player_names.json").read_text())
    players = inventory["players"]
    records = build_player_alias_records(players)
    for player in players:
        # Keep generated lists in the registry only; this file owns source identities.
        player.pop("aliases", None)
    aliases = {player_id: record.model_dump() for player_id, record in records.items()}
    inventory["footballers"] = len(players)
    inventory["profiles_found"] = sum(bool(player.get("slug")) for player in players)
    (data / "player_names.json").write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (data / "aliases.json").write_text(
        json.dumps(aliases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    resolved = sum(bool(player.get("slug")) for player in players)
    print(
        f"Generated {len(aliases)} player records; "
        f"{resolved}/{len(players)} players have source routes."
    )


if __name__ == "__main__":
    main()
