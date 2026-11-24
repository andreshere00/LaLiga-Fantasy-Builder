"""Private worker that executes the market writes users armed in auto-market rules."""

import asyncio
import logging

from fantasy_api.api.deps import build_container

logger = logging.getLogger(__name__)


async def run_worker() -> None:
    """Run bounded passes independently of browser sessions."""
    container = build_container()
    service = container.auto_market_service
    executor = container.auto_market_executor
    assert service is not None and executor is not None
    semaphore = asyncio.Semaphore(2)

    async def evaluate(owner: str, league: str) -> None:
        async with semaphore:
            try:
                await executor.evaluate(owner, league)
            except Exception:
                # Never serialize exceptions carrying provider or connection secrets.
                logger.error("auto_market_pass_failed")

    try:
        if not container.settings.auto_market_service_token:
            raise RuntimeError("AUTO_MARKET_SERVICE_TOKEN is required for the worker")
        await service.repository.start()
        while True:
            work = await service.repository.due()
            await asyncio.gather(*(evaluate(owner, league) for owner, league in work))
            logger.info("auto_market_tick due=%s", len(work))
            await asyncio.sleep(30)
    finally:
        await container.aclose()


def main() -> None:
    """Start the standalone worker; write grants and database configuration are required."""
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
