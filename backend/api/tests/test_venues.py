# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from fantasy_api.domain.venues import VenueDirectory, VenueEntry

# ---- Happy path ---- #


def test_for_club_short_name_betis_returns_real_betis() -> None:
    directory = VenueDirectory(
        (
            VenueEntry(
                club_key="betis",
                fantasy_id=5,
                slug="real-betis",
                name="Real Betis",
                stadium="Benito Villamarín",
                city="Seville",
                country="ES",
                lat=37.356,
                lon=-5.981,
                aliases=("BET", "Betis"),
            ),
        )
    )
    hit = directory.for_club(fantasy_id=None, name="Betis")
    assert hit is not None
    assert hit.name == "Real Betis"


def test_barcelona_venue_is_camp_nou() -> None:
    from fantasy_api.domain.venues import default_venue_directory

    entry = default_venue_directory().for_club(fantasy_id=4, name=None)
    assert entry is not None
    assert entry.stadium == "Camp Nou"
