"""normalise and distance."""

import pytest

from fantasy_scraping.scraper.distance import banded_levenshtein, padded_hamming
from fantasy_scraping.scraper.normalise import base_slug, normalise

# ---- Happy path ---- #


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Iñaki Williams", "inaki-williams"),
        ("N'Golo Kanté", "ngolo-kante"),
        ("Vini Jr.", "vini-jr"),
        ("Øde Straße", "ode-strasse"),
    ],
)
def test_normalise_text_returns_slug_form(raw: str, expected: str) -> None:
    assert normalise(raw) == expected


def test_base_slug_numeric_suffix_is_stripped() -> None:
    assert base_slug("lamine-gueye-1") == "lamine-gueye"


def test_padded_hamming_equal_strings_returns_zero() -> None:
    assert padded_hamming("raphinha", "raphinha") == 0


def test_padded_hamming_length_gap_counts_as_mismatches() -> None:
    assert padded_hamming("abc", "abcde") == 2


def test_padded_hamming_shift_after_deletion_is_large() -> None:
    assert padded_hamming("inaki-alvarez", "inaki-lvarez") == 7


def test_banded_levenshtein_dropped_letter_returns_one() -> None:
    assert banded_levenshtein("inaki-alvarez", "inaki-lvarez", 2) == 1


# ---- Error paths ---- #


def test_banded_levenshtein_over_band_returns_none() -> None:
    assert banded_levenshtein("abcdef", "uvwxyz", 2) is None


# ---- Edge cases ---- #


@pytest.mark.parametrize("raw", ["", "   ", "😀"])
def test_normalise_no_letters_returns_empty(raw: str) -> None:
    assert normalise(raw) == ""


def test_banded_levenshtein_length_gap_over_limit_returns_none() -> None:
    assert banded_levenshtein("a", "abcdef", 2) is None
