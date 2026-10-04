# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from fantasy_api.domain.geo import haversine_km

# ---- Happy path ---- #


def test_haversine_km_same_point_returns_zero() -> None:
    assert haversine_km(41.0, 2.0, 41.0, 2.0) == 0.0


def test_haversine_km_camp_nou_sanchez_pizjuan() -> None:
    distance = haversine_km(41.3809, 2.1228, 37.3840, -5.9705)
    assert 823.9 <= distance <= 825.9


def test_haversine_km_symmetry() -> None:
    a = haversine_km(40.4531, -3.6883, 41.3809, 2.1228)
    b = haversine_km(41.3809, 2.1228, 40.4531, -3.6883)
    assert a == b
