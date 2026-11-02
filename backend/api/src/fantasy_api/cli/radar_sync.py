"""Explicit operational radar jobs; no public writes or Fantasy account access."""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

import httpx

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.clients.scraping import ScrapingClient
from fantasy_api.config import get_settings
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.radar.audits import SupplyAudits
from fantasy_api.radar.catalog import CatalogInventory, build_inventory, inventory_report
from fantasy_api.radar.files import atomic_json, content_id, read_json
from fantasy_api.radar.registry import IdentityRegistry, propose_identities
from fantasy_api.radar.releases import (
    PublishedDataset,
    load_release,
    publish_release,
    publisher_lock,
    rollback_release,
)
from fantasy_api.schemas.player_radar import DataMBPlayer, RadarQuery, RadarStore
from fantasy_api.services.radar_sync import compile_dataset, fetch_tasks, plan_tasks


async def _public_catalog() -> object:
    """Use the established public repository without pairing or a bearer."""
    from fantasy_api.repositories.players import PlayersRepository

    settings = get_settings()
    client = LaligaFantasyClient(origin=settings.laliga_fantasy_origin)
    try:
        return await PlayersRepository(
            client, competition_id=settings.laliga_competition_id
        ).list_players()
    finally:
        await client.aclose()


def _parser() -> argparse.ArgumentParser:
    """Describe separate offline approval, network acquisition and publication steps."""
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
    audit = sub.add_parser("audit", help="Verify supply permissions and seven-column captures")
    audit.add_argument("--audits", type=Path, required=True)
    audit.add_argument("--captures", type=Path, required=True)
    capture = sub.add_parser("capture", help="Capture an observed DataMB profile for review")
    capture.add_argument("--profile-key", required=True)
    capture.add_argument("--season", required=True)
    capture.add_argument("--output", type=Path, required=True)
    for command in ("plan", "fetch", "validate"):
        job = sub.add_parser(command)
        job.add_argument("--work-dir", type=Path, required=True)
        job.add_argument("--registry", type=Path, required=True)
        job.add_argument("--audits", type=Path, required=True)
        job.add_argument("--captures", type=Path, required=True)
        if command == "fetch":
            job.add_argument("--imports", type=Path)
            job.add_argument("--refresh-days", type=int, choices=range(1, 31), default=7)
        if command == "validate":
            job.add_argument("--stale-days", type=int, choices=range(1, 31), default=8)
            job.add_argument("--maximum-days", type=int, choices=range(1, 366), default=30)
    publish = sub.add_parser("publish", help="Promote an already validated dataset")
    publish.add_argument("--validated", type=Path, required=True)
    publish.add_argument("--root", type=Path, required=True)
    report = sub.add_parser("report")
    report.add_argument("--root", type=Path, required=True)
    rollback = sub.add_parser("rollback")
    rollback.add_argument("--root", type=Path, required=True)
    rollback.add_argument("--release-id", required=True)
    return parser


async def _fetch(args: argparse.Namespace, tasks: list) -> dict[str, int]:
    """Close the private shared client even when a source or disk fails."""
    settings = get_settings()
    scraper = ScrapingClient(
        base_url=settings.scraping_base_url,
        service_token=settings.scraping_service_token,
        timeout_seconds=settings.scraping_timeout_seconds,
    )
    try:
        imports = RadarStore.model_validate(read_json(args.imports)) if args.imports else None
        return await fetch_tasks(
            tasks, args.work_dir, scraper, imports=imports, refresh_days=args.refresh_days
        )
    finally:
        await scraper.aclose()


async def _capture(args: argparse.Namespace) -> dict[str, str]:
    """Save a private-adapter capture without approving identity or publishing it."""
    RadarQuery(season=args.season)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,120}_stats", args.profile_key):
        raise ValueError("invalid observed DataMB key")
    if args.output.exists():
        raise ValueError("capture already exists; use a new output path")
    settings = get_settings()
    scraper = ScrapingClient(
        base_url=settings.scraping_base_url,
        service_token=settings.scraping_service_token,
        timeout_seconds=settings.scraping_timeout_seconds,
    )
    try:
        payload = await scraper.get_json(
            "/internal/radar/datamb",
            {"profile_key": args.profile_key, "season": args.season},
        )
        row = DataMBPlayer.model_validate(payload)
        if row.season != args.season:
            raise ValueError("capture season mismatch")
        value = row.model_dump(mode="json")
        atomic_json(args.output, value)
        return {"capture_hash": content_id(value), "output": str(args.output)}
    finally:
        await scraper.aclose()


def _run(args: argparse.Namespace) -> dict:
    """Dispatch explicit operations without activating a provider or a scheduler."""
    if args.command == "capture":
        return asyncio.run(_capture(args))
    if args.command == "registry":
        registry = IdentityRegistry.model_validate(read_json(args.registry))
        return {"identities": len(registry.current()), "versions": len(registry.records)}
    if args.command == "audit":
        return SupplyAudits.model_validate(read_json(args.audits)).report(args.captures)
    if args.command == "publish":
        dataset = PublishedDataset.model_validate(read_json(args.validated))
        return {"release_id": publish_release(args.root, dataset)}
    if args.command == "report":
        return load_release(args.root).report
    if args.command == "rollback":
        rollback_release(args.root, args.release_id)
        return {"release_id": args.release_id}
    if args.command == "inventory":
        RadarQuery(season=args.season)
        with publisher_lock(args.work_dir):
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
            # Inventory is authoritative. Coverage here is only a review queue; served
            # coverage is published with its catalog in one immutable release.
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
            atomic_json(path, result.model_dump(mode="json"))
            return inventory_report(result)
    catalog = CatalogInventory.model_validate(read_json(args.work_dir / "catalog.json"))
    if args.command == "candidates":
        proposals = propose_identities(catalog, read_json(args.aliases))
        atomic_json(args.work_dir / "identity-review.json", proposals)
        return {"pending_review": len(proposals)}
    registry = IdentityRegistry.model_validate(read_json(args.registry))
    audits = SupplyAudits.model_validate(read_json(args.audits))
    tasks = plan_tasks(catalog, registry, audits, args.captures)
    if args.command == "plan":
        manifest = {
            "catalog_snapshot_id": catalog.snapshot_id,
            "tasks": [task.model_dump(mode="json") for task in tasks],
        }
        atomic_json(args.work_dir / "plan.json", manifest)
        return {"approved_tasks": len(tasks), "footballers": len(catalog.players)}
    if args.command == "fetch":
        return asyncio.run(_fetch(args, tasks))
    if args.stale_days >= args.maximum_days:
        raise ValueError("stale threshold must precede maximum age")
    with publisher_lock(args.work_dir):
        dataset = compile_dataset(
            catalog,
            registry,
            tasks,
            args.work_dir,
            stale_days=args.stale_days,
            maximum_days=args.maximum_days,
        )
        atomic_json(args.work_dir / "validated.json", dataset.model_dump(mode="json"))
    return dataset.report


def main(argv: list[str] | None = None) -> int:
    """Run an explicit job and print a safe machine-readable result or sanitized failure."""
    args = _parser().parse_args(argv)
    try:
        print(json.dumps(_run(args), ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError, httpx.HTTPError, UpstreamError):
        print(
            "Radar job failed; check inputs, approved supply, locks and configuration.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
