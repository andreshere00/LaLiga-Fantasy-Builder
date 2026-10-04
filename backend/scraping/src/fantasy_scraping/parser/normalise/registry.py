"""Normaliser names stored in rule files."""

from collections.abc import Callable
from typing import Any

from fantasy_scraping.parser.normalise.dates import date_dmy, duration_days, time_hhmm
from fantasy_scraping.parser.normalise.enums import foot, position_code, risk_level, split_slash
from fantasy_scraping.parser.normalise.identity import (
    data_local_side,
    player_display_name,
    player_shirt_number,
)
from fantasy_scraping.parser.normalise.numbers import (
    dash_decimal,
    es_decimal,
    es_int,
    es_int_token,
    es_percent,
    signed_delta,
)
from fantasy_scraping.parser.normalise.ratios import count_percent, ratio
from fantasy_scraping.parser.normalise.stars import stars
from fantasy_scraping.parser.normalise.text import clean_text

Normaliser = Callable[[str], Any]


def _identity(value: str) -> str:
    return clean_text(value)


def _count(value: str) -> int:
    return int(value)


REGISTRY: dict[str, Normaliser] = {
    "clean_text": _identity,
    "es_int": es_int,
    "es_int_token": es_int_token,
    "es_decimal": es_decimal,
    "dash_decimal": dash_decimal,
    "es_percent": es_percent,
    "signed_delta": signed_delta,
    "date_dmy": date_dmy,
    "duration_days": duration_days,
    "time_hhmm": time_hhmm,
    "ratio": ratio,
    "count_percent": count_percent,
    "stars": stars,
    "position_code": position_code,
    "foot": foot,
    "risk_level": risk_level,
    "split_slash": split_slash,
    "count": _count,
    "player_display_name": player_display_name,
    "player_shirt_number": player_shirt_number,
    "data_local_side": data_local_side,
}
