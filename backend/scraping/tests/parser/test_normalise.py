"""Normaliser behaviour."""

from datetime import UTC, datetime

import pytest

from fantasy_scraping.parser.errors import NormaliseError
from fantasy_scraping.parser.normalise.dates import (
    date_dmy,
    day_month,
    duration_days,
    madrid_date,
    resolve_day_month,
    resolve_sequence,
    time_hhmm,
)
from fantasy_scraping.parser.normalise.enums import (
    availability,
    bid_amount,
    foot,
    hierarchy_rank,
    position_code,
    risk_level,
    split_slash,
)
from fantasy_scraping.parser.normalise.minutes import minutes_note
from fantasy_scraping.parser.normalise.numbers import (
    dash_decimal,
    es_decimal,
    es_int,
    es_int_token,
    es_percent,
    signed_delta,
)
from fantasy_scraping.parser.normalise.ratios import count_percent, ratio
from fantasy_scraping.parser.normalise.registry import REGISTRY
from fantasy_scraping.parser.normalise.stars import stars
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text

# ---- Mocks, fixtures & helpers ---- #

ANCHOR = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)


# ---- Happy path ---- #


def test_es_int_grouped_spanish_integer_returns_int() -> None:
    assert es_int("172.907.890") == 172_907_890
    assert es_int("−307.085") == -307_085
    assert signed_delta("+1.658.150") == 1_658_150
    assert es_int("0") == 0


def test_es_decimal_comma_decimal_returns_float() -> None:
    assert es_decimal("16,71") == 16.71
    assert es_decimal("10,0") == 10.0
    assert es_decimal("−0,18") == -0.18
    assert es_percent("64 %") == 64
    assert es_percent("−0,18 %") == -0.18


def test_ratio_and_count_percent_published_cells_return_parts() -> None:
    parsed = ratio("16 / 25 (64 %)")
    assert (parsed.numerator, parsed.denominator, parsed.percent) == (16, 25, 64)
    bare = ratio("3 / 3")
    assert bare.percent is None
    counted = count_percent("7 (100 %)")
    assert (counted.count, counted.percent) == (7, 100)
    plain = count_percent("4")
    assert plain.percent is None


def test_minutes_note_sale_and_full_sets_event() -> None:
    sale = minutes_note("Sale 76'", starter=True)
    assert sale.event == "subbed_off" and sale.minutes == 76
    assert minutes_note("Sale 76'", starter=False).minutes is None
    assert minutes_note("90'", starter=True).event == "full"
    entra = minutes_note("Entra 62'", starter=False)
    assert entra.event == "subbed_on" and entra.minutes is None
    assert minutes_note("", starter=True).event == "unknown"
    assert minutes_note("suplente", starter=False).event == "unused"


def test_dates_day_month_and_clock_resolve_without_system_clock() -> None:
    assert date_dmy("14/12/1996").isoformat() == "1996-12-14"
    assert date_dmy("29/09/26").isoformat() == "2026-09-29"
    assert date_dmy("01/01/70").year == 1970
    assert day_month("19/09") == (19, 9)
    assert time_hhmm("18:30h") == "18:30"
    assert duration_days("1 día") == 1
    assert duration_days("47 días") == 47
    assert resolve_day_month(4, 10, ANCHOR, "recent").isoformat() == "2026-10-04"
    assert resolve_day_month(4, 10, ANCHOR, "upcoming").isoformat() == "2026-10-04"
    assert resolve_day_month(29, 2, ANCHOR, "recent").isoformat() == "2024-02-29"
    midnight = datetime(2026, 10, 3, 22, 30, tzinfo=UTC)
    assert madrid_date(midnight).isoformat() == "2026-10-04"
    next_day = datetime(2026, 10, 4, 22, 30, tzinfo=UTC)
    assert resolve_day_month(4, 10, next_day, "upcoming").isoformat() == "2027-10-04"
    seq = resolve_sequence([(3, 10), (30, 9)], ANCHOR, "recent")
    assert [item.isoformat() for item in seq] == ["2026-10-03", "2026-09-30"]


def test_enums_known_labels_map_to_codes() -> None:
    assert position_code("DEL") == "DEL"
    assert position_code("portero") == "POR"
    assert foot("derecha") == "right"
    assert risk_level("Bajo") == "low"
    status, matchday = availability("Disponible para la jornada 8")
    assert status == "available" and matchday == 8
    assert hierarchy_rank("Dios", {"dios": 1}) == 1
    assert split_slash("Brasil / España") == ["Brasil", "España"]
    assert bid_amount("Sin rentabilidad") == (None, False)
    assert bid_amount("—") == (None, None)
    assert bid_amount("") == (None, None)
    assert REGISTRY["count"]("12") == 12
    assert stars("★★★") == 3
    assert stars("") is None
    assert es_int_token("29 años") == 29
    assert dash_decimal("—") is None
    assert clean_text("  a\u00a0b  ") == "a b"
    assert casefold_key("Córners") == "corners"


# ---- Error paths ---- #


def test_es_int_invalid_grouping_raises() -> None:
    with pytest.raises(NormaliseError):
        es_int("1.5")
    with pytest.raises(NormaliseError):
        es_int("1.2.3")
    with pytest.raises(NormaliseError):
        es_int_token("sin número")


def test_date_dmy_invalid_day_raises() -> None:
    with pytest.raises(NormaliseError):
        date_dmy("32/01/2026")


def test_resolve_day_month_unknown_direction_raises() -> None:
    with pytest.raises(NormaliseError):
        resolve_day_month(1, 1, ANCHOR, "sideways")


# ---- Edge cases ---- #


def test_availability_unknown_sentence_returns_unknown() -> None:
    status, matchday = availability("Pendiente de decisión")
    assert status == "unknown" and matchday is None


def test_ratio_invalid_text_raises() -> None:
    with pytest.raises(NormaliseError):
        ratio("no")
    with pytest.raises(NormaliseError):
        count_percent("nope")
    with pytest.raises(NormaliseError):
        time_hhmm("25:99h")
    with pytest.raises(NormaliseError):
        duration_days("una semana")
    with pytest.raises(NormaliseError):
        es_decimal("abc")
    assert position_code("entrenador") is None
    assert foot("centro") is None
    assert risk_level("nulo") is None
    assert hierarchy_rank("misterioso", {"dios": 1}) is None
    assert minutes_note("algo raro", starter=True).event == "unknown"
    assert dash_decimal("1.234,50") == 1234.5
    assert es_decimal("12") == 12
