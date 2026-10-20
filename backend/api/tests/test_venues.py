# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from fantasy_api.domain.venues import VenueDirectory, VenueEntry, default_venue_directory

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


def test_for_club_shared_word_madrid_returns_none() -> None:
    directory = default_venue_directory()
    assert directory.for_club(fantasy_id=None, name="Madrid") is None
    assert directory.for_club(fantasy_id=None, name="Real") is None
    girona = directory.for_club(fantasy_id=None, name="Girona")
    palmas = directory.for_club(fantasy_id=None, name="Palmas")
    assert girona is not None and girona.club_key == "girona"
    assert palmas is not None and palmas.club_key == "las-palmas"


def test_barcelona_venue_is_camp_nou() -> None:
    entry = default_venue_directory().for_club(fantasy_id=4, name=None)
    assert entry is not None
    assert entry.stadium == "Camp Nou"


def test_for_club_current_fantasy_ids_resolve_all_twenty_participants() -> None:
    directory = default_venue_directory()
    expected = {
        2: "atletico",
        3: "athletic",
        4: "barcelona",
        5: "betis",
        6: "celta",
        7: "elche",
        8: "espanyol",
        9: "getafe",
        11: "levante",
        12: "malaga",
        13: "osasuna",
        14: "rayo",
        15: "real-madrid",
        16: "real-sociedad",
        17: "sevilla",
        18: "valencia",
        20: "villarreal",
        21: "alaves",
        26: "deportivo",
        49: "racing-santander",
    }
    for club_id, key in expected.items():
        entry = directory.for_club(fantasy_id=club_id, name=None)
        assert entry is not None and entry.club_key == key
    assert directory.for_club(fantasy_id=5, name=None).stadium == "Estadio La Cartuja"
