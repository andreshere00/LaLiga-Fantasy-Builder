"""Regenerate aliases from the reviewed public player identity inventory."""

import json
from pathlib import Path

from fantasy_scraping.scraper.name_aliases import build_aliases, player_aliases


def main() -> None:
    """Generate the route index and preserve explicit unavailable player IDs."""
    data = Path(__file__).resolve().parents[1] / "src/fantasy_scraping/scraper/data"
    inventory = json.loads((data / "player_names.json").read_text())
    players = inventory["players"]
    ids = [str(player["id"]) for player in players]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate player IDs in identity inventory")
    for player in players:
        player["aliases"] = player_aliases(player)
    aliases = build_aliases(players)
    for player in players:
        if not player.get("slug"):
            aliases[str(player["id"])] = []
    aliases = dict(
        sorted(
            aliases.items(),
            key=lambda item: (0, int(item[0])) if item[0].isdigit() else (1, item[0]),
        )
    )
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
        f"Generated {len(aliases)} aliases; {resolved}/{len(players)} players have source routes."
    )


if __name__ == "__main__":
    main()
