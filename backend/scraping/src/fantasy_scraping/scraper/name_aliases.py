"""Build accent-insensitive name aliases from published player identities."""

from collections import defaultdict
from collections.abc import Iterable, Mapping
from itertools import product

from pydantic import BaseModel, ConfigDict, field_validator

from fantasy_scraping.scraper.normalise import normalise
from fantasy_scraping.scraper.urls import PLAYER_SLUG_RE

type AliasValue = str | list[str]


class PlayerAliasRecord(BaseModel):
    """Reviewed identity and normalized lookup names for one Fantasy master ID."""

    model_config = ConfigDict(extra="forbid", strict=True)

    full_name: str | None
    slug: str | None
    team_id: str | None
    team: str | None
    aliases: list[str]

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        """Reject unverified route shapes before constructing the lookup index."""
        if value is not None and not PLAYER_SLUG_RE.fullmatch(value):
            raise ValueError("invalid player route in identity inventory")
        return value

    @field_validator("aliases")
    @classmethod
    def validate_aliases(cls, values: list[str]) -> list[str]:
        """Require normalized nonnumeric names distinct from master player IDs."""
        if any(not v or v.isdigit() or normalise(v) != v for v in values):
            raise ValueError("player aliases must be normalized nonnumeric names")
        return sorted(set(values))


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


def build_player_alias_records(
    players: Iterable[Mapping[str, object]],
) -> dict[str, PlayerAliasRecord]:
    """Group reviewed routes and generated names by Fantasy master player ID.

    Args:
        players: Published identity inventory, including unavailable source routes.

    Returns:
        Deterministically ordered records with source routes and identity metadata.
    """
    records: dict[str, PlayerAliasRecord] = {}
    for player in players:
        player_id = str(player["id"])
        if not player_id.isascii() or not player_id.isdigit():
            raise ValueError("invalid Fantasy master player ID")
        if player_id in records:
            raise ValueError("duplicate player IDs in identity inventory")
        records[player_id] = PlayerAliasRecord.model_validate(
            {
                "full_name": player.get("full_name"),
                "slug": player.get("slug"),
                "team_id": player.get("catalog_team_id"),
                "team": player.get("catalog_team"),
                "aliases": player_aliases(player),
            }
        )
    return dict(sorted(records.items(), key=lambda pair: int(pair[0])))


def index_player_alias_records(records: Mapping[str, PlayerAliasRecord]) -> dict[str, AliasValue]:
    """Compile grouped records into fast ID and collision-preserving name lookups.

    Args:
        records: Validated per-player identities from the bundled registry.

    Returns:
        Master ID and normalized name to source routes. Unavailable IDs map to
        empty lists, preventing fuzzy fallback to another player. Team metadata
        is a catalog snapshot; live profile club verification remains authoritative.
    """
    targets: dict[str, set[str]] = defaultdict(set)
    ids: dict[str, AliasValue] = {}
    for player_id, player in records.items():
        if not player_id.isascii() or not player_id.isdigit():
            raise ValueError("invalid Fantasy master player ID")
        ids[player_id] = player.slug if player.slug is not None else []
        if player.slug is None:
            continue
        for variant in player.aliases:
            targets[variant].add(player.slug)
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
