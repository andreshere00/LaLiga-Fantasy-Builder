"""Optional synchronous observer for event-loop-owned build progress."""

from collections.abc import Callable

from fantasy_api.schemas.lineup_builder import BuildProgress

ProgressCallback = Callable[[BuildProgress], None]
