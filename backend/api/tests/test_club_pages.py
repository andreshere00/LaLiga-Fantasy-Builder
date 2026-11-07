# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from fantasy_api.domain.club_pages import load_futbolfantasy_club_pages

CURRENT_SLUGS = {
    "alaves",
    "athletic",
    "atletico",
    "barcelona",
    "betis",
    "celta",
    "deportivo",
    "elche",
    "espanyol",
    "getafe",
    "levante",
    "malaga",
    "osasuna",
    "racing",
    "rayo-vallecano",
    "real-madrid",
    "real-sociedad",
    "sevilla",
    "valencia",
    "villarreal",
}

# ---- Happy path ---- #


def test_slug_for_known_club_returns_verified_slug() -> None:
    pages = load_futbolfantasy_club_pages()
    assert pages.slug_for(4) == "barcelona"
    assert pages.slug_for(20) == "villarreal"
    assert pages.slug_for(9) == "getafe"
    barcelona = pages.get(4)
    assert barcelona is not None
    assert barcelona.name == "FC Barcelona"


def test_slug_for_promoted_club_returns_verified_slug() -> None:
    pages = load_futbolfantasy_club_pages()
    assert pages.slug_for(26) == "deportivo"
    assert pages.slug_for(12) == "malaga"
    assert pages.slug_for(49) == "racing"


def test_load_futbolfantasy_club_pages_covers_current_twenty() -> None:
    pages = load_futbolfantasy_club_pages()
    assert {club.slug for club in pages.clubs} == CURRENT_SLUGS
    assert len(pages.clubs) == 20


# ---- Error paths ---- #


def test_slug_for_unknown_club_returns_none() -> None:
    pages = load_futbolfantasy_club_pages()
    assert pages.slug_for(28) is None
    assert pages.slug_for(19) is None
    assert pages.get(999) is None


# ---- Edge cases ---- #


def test_slug_for_non_positive_id_returns_none() -> None:
    pages = load_futbolfantasy_club_pages()
    assert pages.slug_for(0) is None
    assert pages.slug_for(-4) is None
