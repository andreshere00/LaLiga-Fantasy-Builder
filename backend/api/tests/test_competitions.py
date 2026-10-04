# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import pytest
from fantasy_api.domain.competitions import classify_competition
from fantasy_api.schemas.player_stats import Competition

# ---- Happy path ---- #


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("LaLiga EA Sports", Competition.LALIGA),
        ("La Liga", Competition.LALIGA),
        ("Champions Lg", Competition.CHAMPIONS_LEAGUE),
        ("UEFA Champions League", Competition.CHAMPIONS_LEAGUE),
        ("Europa League", Competition.EUROPA_LEAGUE),
        ("Europa Conference League", Competition.CONFERENCE_LEAGUE),
        ("Conf Lg", Competition.CONFERENCE_LEAGUE),
        ("Copa del Rey", Competition.COPA_DEL_REY),
        ("Supercopa de España", Competition.SUPERCOPA),
        ("UEFA Super Cup", Competition.OTHER),
        ("Amistoso", Competition.OTHER),
        (None, Competition.OTHER),
        ("", Competition.OTHER),
    ],
)
def test_classify_competition_labels(label: str | None, expected: Competition) -> None:
    assert classify_competition(label) == expected
