# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from fantasy_api.domain.clubs import ClubDirectory, load_alias_map

TEAMS = [
    {"id": 4, "name": "FC Barcelona", "shortName": "BAR", "slug": "fc-barcelona"},
    {"id": 15, "name": "Real Madrid CF", "shortName": "RMA", "slug": "real-madrid"},
    {"id": 99, "name": "Other Club", "shortName": "OTH", "slug": "other"},
]

# ---- Happy path ---- #


def test_load_alias_map_reads_committed_overrides() -> None:
    aliases = load_alias_map()
    assert aliases["Barça"] == "FC Barcelona"


def test_match_by_short_code_prefers_laliga_team() -> None:
    directory = ClubDirectory(TEAMS, laliga_ids=frozenset({4, 15}), aliases=load_alias_map())
    hit = directory.match("BAR")
    assert hit is not None
    assert hit.club_id == 4


def test_match_by_normalised_name() -> None:
    directory = ClubDirectory(TEAMS, laliga_ids=frozenset({4, 15}), aliases={})
    hit = directory.match("FC Barcelona")
    assert hit is not None
    assert hit.club_id == 4


def test_match_follows_alias_to_full_name() -> None:
    directory = ClubDirectory(TEAMS, laliga_ids=frozenset({4}), aliases=load_alias_map())
    hit = directory.match("Barça")
    assert hit is not None
    assert hit.club_id == 4


def test_by_id_returns_club() -> None:
    directory = ClubDirectory(TEAMS, laliga_ids=frozenset({4}), aliases={})
    club = directory.by_id(4)
    assert club is not None
    assert club.short_name == "BAR"


# ---- Error paths ---- #


def test_match_empty_label_returns_none() -> None:
    directory = ClubDirectory(TEAMS, laliga_ids=frozenset({4}), aliases={})
    assert directory.match("   ") is None


# ---- Edge cases ---- #


def test_directory_skips_invalid_team_rows() -> None:
    directory = ClubDirectory(
        [{"id": "bad"}, {"id": 0}, {"dspId": 4, "name": "FC Barcelona", "shortName": "BAR"}],
        laliga_ids=frozenset({4}),
        aliases={},
    )
    assert directory.by_id(4) is not None
    assert directory.match("unknown club") is None
