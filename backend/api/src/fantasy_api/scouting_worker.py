"""Private read-only worker for persisted scouting watches."""

import asyncio
import logging

from fantasy_api.api.deps import build_container

logger = logging.getLogger(__name__)


async def run_worker() -> None:
    """Run bounded monitoring independently of browser sessions."""
    container = build_container()
    service = container.scouting_service
    assert service is not None
    semaphore = asyncio.Semaphore(2)

    async def evaluate(owner: str, league: str) -> None:
        async with semaphore:
            try:
                await service.evaluate(owner, league)
            except Exception:
                # Never serialize exceptions carrying provider or connection secrets.
                logger.error("scouting_pass_failed")

    try:
        if not container.settings.scouting_service_token:
            raise RuntimeError("SCOUTING_SERVICE_TOKEN is required for the worker")
        await service.repository.start()
        while True:
            work = await service.repository.due()
            await asyncio.gather(*(evaluate(owner, league) for owner, league in work))
            logger.info(
                "scouting_tick due=%s metrics=%s", len(work), await service.repository.metrics()
            )
            await asyncio.sleep(60)
    finally:
        await container.aclose()


def main() -> None:
    """Start the standalone worker; grants and database configuration are required."""
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
