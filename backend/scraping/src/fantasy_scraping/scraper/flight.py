"""Coalesce concurrent identical operations into one."""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any


class SingleFlight:
    """Share one in-flight task per key; a cancelled waiter does not cancel the task."""

    def __init__(self) -> None:
        """Start with nothing in flight."""
        self._tasks: dict[str, asyncio.Future[Any]] = {}

    async def run[T](self, key: str, factory: Callable[[], Awaitable[T]]) -> T:
        """Run ``factory`` once per key while a call is in flight.

        Args:
            key: Identity of the operation.
            factory: Coroutine function started by the first caller.

        Returns:
            The shared result. Exceptions propagate to every waiter.
        """
        task = self._tasks.get(key)
        if task is None:
            task = asyncio.ensure_future(factory())
            self._tasks[key] = task
            task.add_done_callback(lambda _: self._tasks.pop(key, None))
        return await asyncio.shield(task)
