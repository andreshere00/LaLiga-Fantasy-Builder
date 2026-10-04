"""RouteResolver scoring rules."""

import pytest
from conftest import SLUGS

from fantasy_scraping.scraper.errors import InvalidRequestError, PlayerNotFoundError
from fantasy_scraping.scraper.resolver import RouteResolver

# ---- Mocks, fixtures & helpers ---- #


@pytest.fixture
def resolver() -> RouteResolver:
    return RouteResolver(SLUGS, {"3102": "vinicius-junior", "vini-jr": "vinicius-junior"})


# ---- Happy path ---- #


@pytest.mark.parametrize(
    ("name", "slug", "metric"),
    [
        ("Raphinha", "raphinha", "exact"),
        ("Raphinah", "raphinha", "hamming"),
        ("Oyarzabal", "mikel-oyarzabal", "hamming"),
        ("Camavinga", "eduardo-camavinga", "hamming"),
        ("Iñaki Williams", "inaki-williams", "exact"),
        ("Vinícius Júnior", "vinicius-junior", "exact"),
        ("Lamine Yamal", "lamine-yamal", "exact"),
        ("Iñaki Álvarez", "inaki-lvarez", "levenshtein"),
    ],
)
def test_resolve_close_name_returns_expected_slug(
    resolver: RouteResolver, name: str, slug: str, metric: str
) -> None:
    result = resolver.resolve(name)

    assert result.candidates[0].slug == slug
    assert result.candidates[0].metric == metric
    assert not result.ambiguous


def test_resolve_player_id_alias_short_circuits(resolver: RouteResolver) -> None:
    result = resolver.resolve("Anything", player_id="3102")

    assert result.candidates[0].metric == "alias"
    assert result.candidates[0].slug == "vinicius-junior"


def test_resolve_nickname_alias_short_circuits(resolver: RouteResolver) -> None:
    assert resolver.resolve("Vini Jr.").candidates[0].slug == "vinicius-junior"


# ---- Error paths ---- #


def test_resolve_unknown_name_raises_not_found(resolver: RouteResolver) -> None:
    with pytest.raises(PlayerNotFoundError):
        resolver.resolve("Zzzz Qqqq")


def test_resolve_empty_name_raises_invalid(resolver: RouteResolver) -> None:
    with pytest.raises(InvalidRequestError):
        resolver.resolve("!!!")


def test_resolve_nickname_without_alias_is_rejected() -> None:
    with pytest.raises(PlayerNotFoundError):
        RouteResolver(SLUGS, {}).resolve("Vini Jr.")


# ---- Edge cases ---- #


def test_resolve_namesakes_marks_ambiguous_and_groups_twins(resolver: RouteResolver) -> None:
    result = resolver.resolve("Gueye")

    assert result.ambiguous
    assert result.candidates[0].slug == "gueye"
    assert {"idrissa-gueye", "idrissa-gueye-1"} <= {c.slug for c in result.candidates}
    assert len(result.candidates) <= 5


def test_resolve_full_name_used_when_nickname_fails(resolver: RouteResolver) -> None:
    result = resolver.resolve("Zzzz", full_name="Lamine Yamal")

    assert result.candidates[0].slug == "lamine-yamal"
