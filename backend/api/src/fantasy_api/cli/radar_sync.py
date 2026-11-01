"""Explicit operational radar jobs; no public writes or Fantasy account access."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

import httpx

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.config import get_settings
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.radar.audits import SupplyAudits
from fantasy_api.radar.catalog import CatalogInventory, build_inventory, inventory_report
from fantasy_api.radar.files import atomic_json, read_json
from fantasy_api.radar.registry import IdentityRegistry, propose_identities
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.schemas.player_radar import RadarQuery


async def _public_catalog() -> object:
    """Use the established public repository without pairing or a bearer."""
    settings = get_settings()
    client = LaligaFantasyClient(origin=settings.laliga_fantasy_origin)
    try:
        return await PlayersRepository(
            client, competition_id=settings.laliga_competition_id
        ).list_players()
    finally:
        await client.aclose()


def main(argv: list[str] | None = None) -> int:
    """Run explicit inventory jobs; invalid input never replaces the previous catalog."""
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    inventory = sub.add_parser("inventory", help="Snapshot the complete public Fantasy catalog")
    inventory.add_argument("--catalog", type=Path, help="Offline full public catalog JSON")
    inventory.add_argument("--work-dir", type=Path, required=True)
    inventory.add_argument("--season", required=True)
    inventory.add_argument("--minimum-count", type=int, default=1)
    inventory.add_argument("--allow-large-removal", action="store_true")
    candidates = sub.add_parser("candidates", help="Propose names by exact ID; never approve links")
    candidates.add_argument("--work-dir", type=Path, required=True)
    candidates.add_argument("--aliases", type=Path, required=True)
    registry = sub.add_parser("registry", help="Validate a reviewed, versioned identity registry")
    registry.add_argument("--registry", type=Path, required=True)
    audit = sub.add_parser("audit", help="Verify source permissions and seven-column captures")
    audit.add_argument("--audits", type=Path, required=True)
    audit.add_argument("--captures", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "audit":
            audits = SupplyAudits.model_validate(read_json(args.audits))
            print(json.dumps(audits.report(args.captures)))
            return 0
        if args.command == "registry":
            result = IdentityRegistry.model_validate(read_json(args.registry))
            print(
                json.dumps({"identities": len(result.current()), "versions": len(result.records)})
            )
            return 0
        if args.command == "candidates":
            catalog = CatalogInventory.model_validate(read_json(args.work_dir / "catalog.json"))
            proposals = propose_identities(catalog, read_json(args.aliases))
            atomic_json(args.work_dir / "identity-review.json", proposals)
            print(json.dumps({"pending_review": len(proposals)}))
            return 0
        RadarQuery(season=args.season)
        path = args.work_dir / "catalog.json"
        previous = CatalogInventory.model_validate(read_json(path)) if path.exists() else None
        payload = read_json(args.catalog) if args.catalog else asyncio.run(_public_catalog())
        result = build_inventory(
            payload,
            args.season,
            previous,
            minimum_count=args.minimum_count,
            allow_large_removal=args.allow_large_removal,
        )
        atomic_json(path, result.model_dump(mode="json"))
        atomic_json(
            args.work_dir / "coverage.json",
            {
                "catalog_snapshot_id": result.snapshot_id,
                "season": result.season,
                "players": [
                    {"player_id": p.player_id, "identity_status": "pending_review"}
                    for p in result.players
                ],
            },
        )
        print(json.dumps(inventory_report(result), ensure_ascii=False))
        return 0
    except (OSError, ValueError, httpx.HTTPError, UpstreamError):
        print(
            "Radar job failed; check input, configuration and catalog completeness.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
