"""Build accent-insensitive name aliases from published player identities."""

from collections import defaultdict
from collections.abc import Iterable, Mapping
from itertools import product

from fantasy_scraping.scraper.normalise import normalise
from fantasy_scraping.scraper.urls import PLAYER_SLUG_RE

type AliasValue = str | list[str]
_PARTICLES = frozenset(
    {"da", "das", "de", "del", "di", "dos", "el", "la", "le", "ter", "van", "von"}
)


def name_variants(name: str) -> set[str]:
    """Return given-name, surname and initial forms of a published name.

    Args:
        name: Display or full personal name from a source profile.

    Returns:
        Normalised aliases. All plausible given-name/surname boundaries are
        considered because the source does not label these components. Particles
        remain attached to surnames; no second surname is invented.
    """
    tokens = normalise(name).split("-")
    if not tokens or not tokens[0]:
        return set()
    variants = {"-".join(tokens)}
    for split in range(1, len(tokens)):
        if tokens[split] in _PARTICLES and split + 1 == len(tokens):
            continue
        if tokens[split - 1] in _PARTICLES:
            continue
        given = tokens[:split]
        surnames = _surname_groups(tokens[split:])
        if not surnames:
            continue
        surname = surnames[0]
        surname_initials = [_initials(group) for group in surnames]
        for first in dict.fromkeys(("-".join(given), given[0])):
            variants.update(
                {
                    first,
                    surname,
                    "-".join(surnames),
                    f"{first}-{surname}",
                }
            )
            variants.update(f"{first}-{initial}" for initial in surname_initials[0])
            if len(surnames) > 1:
                variants.add(f"{first}-{surnames[0]}-{surnames[1]}")
                variants.update(f"{first}-{a}-{b}" for a, b in product(*surname_initials[:2]))
        for initial in dict.fromkeys(
            (given[0][0], "".join(t[0] for t in given), "-".join(t[0] for t in given))
        ):
            variants.add(f"{initial}-{surname}")
            variants.add(f"{initial}-{'-'.join(surnames)}")
        variants.update(surnames)
    return {v for v in variants if v and v not in _PARTICLES and len(v) > 1}


def build_aliases(players: Iterable[Mapping[str, object]]) -> dict[str, AliasValue]:
    """Index verified routes by master player ID and all published name forms.

    Args:
        players: Identity records with ``id``, ``slug`` and optional name fields.
            Records without a verified source route are omitted from this index.

    Returns:
        ID aliases plus name aliases. Colliding names retain every route instead
        of overwriting another player's identity.
    """
    targets: dict[str, set[str]] = defaultdict(set)
    ids: dict[str, str] = {}
    for player in players:
        slug = player.get("slug")
        if not isinstance(slug, str) or not slug:
            continue
        if not PLAYER_SLUG_RE.fullmatch(slug):
            raise ValueError("invalid player route in identity inventory")
        player_id = str(player["id"])
        if player_id in ids and ids[player_id] != slug:
            raise ValueError("conflicting player ID aliases")
        ids[player_id] = slug
        for variant in player_aliases(player):
            targets[variant].add(slug)
    result: dict[str, AliasValue] = dict(sorted(ids.items(), key=lambda pair: int(pair[0])))
    for name, slugs in sorted(targets.items()):
        ordered = sorted(slugs)
        result[name] = ordered[0] if len(ordered) == 1 else ordered
    return result


def player_aliases(player: Mapping[str, object]) -> list[str]:
    """Return sorted name aliases for one player, including identities without a route.

    Args:
        player: Published nickname, display name and available full personal name.

    Returns:
        Accent-insensitive name forms, omitting empty names and numeric-only aliases.
    """
    variants: set[str] = set()
    for field in ("nickname", "source_nickname", "display_name", "full_name"):
        name = player.get(field)
        if isinstance(name, str) and name.strip():
            variants.update(name_variants(name))
    return sorted(variant for variant in variants if not variant.isdigit())


def _surname_groups(tokens: list[str]) -> list[str]:
    """Keep particles attached to the word they introduce."""
    groups: list[str] = []
    pending: list[str] = []
    for token in tokens:
        pending.append(token)
        if token not in _PARTICLES:
            groups.append("-".join(pending))
            pending = []
    return groups


def _initials(surname: str) -> set[str]:
    """Support initials both with and without a leading surname particle."""
    return {surname[0], next(t[0] for t in surname.split("-") if t not in _PARTICLES)}
