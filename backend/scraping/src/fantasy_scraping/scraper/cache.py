"""In-memory TTL cache with a stale window and key builders."""

from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from fantasy_scraping.scraper.clock import Clock

KEY_PREFIX: str = "fantasy:scrape:v1:"
MAX_ENTRIES: int = 512


def page_key(kind: str, *parts: str) -> str:
    """Build a cache key from validated parts."""
    return KEY_PREFIX + ":".join(("page", kind, *parts))


def route_key(season: str, who: str, team: str | None) -> str:
    """Build a route cache key."""
    return f"{KEY_PREFIX}route:{season}:{who}:{team or '-'}"


INDEX_KEY: str = f"{KEY_PREFIX}index:futbolfantasy"


@dataclass(frozen=True, slots=True)
class CacheHit:
    """A cached value and whether it is still inside its fresh window."""

    value: Any
    fresh: bool


class PageCache(Protocol):
    """Cache contract; tests inject a double."""

    def get(self, key: str) -> CacheHit | None:
        """Return a fresh or stale hit, or None."""
        ...

    def set(self, key: str, value: Any, ttl_s: float, stale_s: float = 0) -> None:
        """Store a value."""
        ...

    def delete_matching(self, predicate: Callable[[str], bool]) -> int:
        """Delete keys for which ``predicate`` is true and return how many."""
        ...

    def stats(self) -> dict[str, int]:
        """Return entry count and hit/miss counters."""
        ...


class MemoryCache:
    """LRU cache bounded by entry count."""

    def __init__(self, clock: Clock, max_entries: int = MAX_ENTRIES) -> None:
        """Create an empty cache.

        Args:
            clock: Time source for expiry.
            max_entries: Entries kept before the least recently used is evicted.
        """
        self._clock: Clock = clock
        self._max: int = max_entries
        self._items: OrderedDict[str, tuple[Any, float, float]] = OrderedDict()
        self._hits: int = 0
        self._misses: int = 0

    def get(self, key: str) -> CacheHit | None:
        """Return a hit, marking staleness, or None once fully expired."""
        item = self._items.get(key)
        now = self._clock.monotonic()
        if item is not None and now >= item[2]:
            del self._items[key]
            item = None
        if item is None:
            self._misses += 1
            return None
        value, fresh_until, _ = item
        self._hits += 1
        self._items.move_to_end(key)
        return CacheHit(value, now < fresh_until)

    def set(self, key: str, value: Any, ttl_s: float, stale_s: float = 0) -> None:
        """Store a value fresh for ``ttl_s`` and usable as stale for ``stale_s`` more."""
        now = self._clock.monotonic()
        self._items[key] = (value, now + ttl_s, now + ttl_s + stale_s)
        self._items.move_to_end(key)
        while len(self._items) > self._max:
            self._items.popitem(last=False)

    def delete_matching(self, predicate: Callable[[str], bool]) -> int:
        """Delete matching keys and return the count."""
        doomed = [k for k in self._items if predicate(k)]
        for key in doomed:
            del self._items[key]
        return len(doomed)

    def stats(self) -> dict[str, int]:
        """Return entry count and hit/miss counters."""
        return {"entries": len(self._items), "hits": self._hits, "misses": self._misses}
