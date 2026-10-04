"""Name to slug resolution: padded Hamming first, banded Levenshtein as fallback."""

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass

from fantasy_scraping.scraper.distance import banded_levenshtein, padded_hamming
from fantasy_scraping.scraper.errors import InvalidRequestError, PlayerNotFoundError
from fantasy_scraping.scraper.models import Candidate
from fantasy_scraping.scraper.normalise import base_slug, normalise

AMBIGUITY_GAP: int = 2
MAX_CANDIDATES: int = 5

Distance = Callable[[str, str], int | None]


@dataclass(frozen=True, slots=True)
class Resolution:
    """Outcome of scoring one query.

    Attributes:
        candidates: Best-first slugs within the ambiguity gap of the winner.
        ambiguous: True when another player scores within the gap.
    """

    candidates: list[Candidate]
    ambiguous: bool


class RouteResolver:
    """Pure scorer over a fixed slug list."""

    def __init__(self, slugs: Iterable[str], aliases: Mapping[str, str]) -> None:
        """Pre-split the slugs.

        Args:
            slugs: Sitemap player slugs.
            aliases: Overrides keyed by player id or normalised nickname.
        """
        self._entries: list[tuple[str, str, list[str]]] = [
            (slug, base, base.split("-")) for slug in slugs if (base := base_slug(slug))
        ]
        self._aliases: Mapping[str, str] = aliases

    def resolve(
        self, name: str, *, full_name: str | None = None, player_id: str | None = None
    ) -> Resolution:
        """Resolve a name to ranked candidates.

        Args:
            name: Catalog nickname.
            full_name: Optional secondary name tried when the nickname fails.
            player_id: Optional master player id for the alias table.

        Returns:
            The ranked resolution.

        Raises:
            InvalidRequestError: The name normalises to nothing.
            PlayerNotFoundError: No slug is close enough.
        """
        queries = [q for q in (normalise(name), normalise(full_name or "")) if q]
        if not queries:
            raise InvalidRequestError("invalid name")
        for key in (player_id, queries[0]):
            if key and (slug := self._aliases.get(key)):
                return Resolution([Candidate(slug=slug, distance=0, metric="alias")], False)
        for query in queries:
            allowed = max(1, len(query) // 4)
            for metric, limit in (("hamming", allowed), ("levenshtein", max(1, len(query) // 5))):
                if found := self._rank(query, metric, limit):
                    return found
        raise PlayerNotFoundError()

    def _rank(self, query: str, metric: str, limit: int) -> Resolution | None:
        """Score every slug and apply the threshold and gap rules."""
        band = limit + AMBIGUITY_GAP
        dist: Distance = (
            padded_hamming if metric == "hamming" else lambda a, b: banded_levenshtein(a, b, band)
        )
        scored: list[tuple[tuple[int, int, bool, int, str], str, Candidate]] = []
        for slug, base, tokens in self._entries:
            d_full = dist(query, base)
            token_ds = [d for t in tokens if (d := dist(query, t)) is not None]
            d_tok = min(token_ds) + len(tokens) - 1 if token_ds else None
            best = min((d for d in (d_full, d_tok) if d is not None), default=None)
            if best is None or best > band:
                continue
            label = "exact" if best == 0 else metric
            key = (best, len(tokens), slug != base, abs(len(query) - len(base)), slug)
            scored.append((key, base, Candidate(slug=slug, distance=best, metric=label)))
        scored.sort(key=lambda item: item[0])
        if not scored or scored[0][0][0] > limit:
            return None
        top = scored[0][0][0]
        near = [(b, c) for _, b, c in scored if c.distance - top < AMBIGUITY_GAP]
        ambiguous = len({b for b, _ in near}) > 1
        return Resolution([c for _, c in near[:MAX_CANDIDATES]], ambiguous)
