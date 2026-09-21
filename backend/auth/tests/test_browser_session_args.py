# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from argparse import Namespace
from pathlib import Path

import pytest
from fantasy_auth.cli.browser_session.args import (
    load_put_lineup,
    parse_args,
    validate_analysis_args,
)
from fantasy_auth.cli.browser_session.errors import BrowserSessionError

# ---- Happy path ---- #


def test_load_put_lineup_reads_json_object(tmp_path: Path) -> None:
    # Arrange
    path = tmp_path / "lineup.json"
    path.write_text('{"goalkeeper": []}', encoding="utf-8")

    # Act
    payload = load_put_lineup(str(path))

    # Assert
    assert payload == {"goalkeeper": []}


def test_parse_args_market_analysis_accepts_player_team_id() -> None:
    args = parse_args(
        ["market-analysis", "--league-id", "42", "--player-team-id", "pt-9"],
    )
    assert args.flow == "market-analysis"
    assert args.league_id == "42"
    assert args.player_team_id == "pt-9"


def test_parse_args_leagues_analysis_accepts_positive_week() -> None:
    # Arrange / Act
    args = parse_args(["leagues-analysis", "--week", "4", "--activity-page", "2"])

    # Assert
    assert args.flow == "leagues-analysis"
    assert args.week == 4
    assert args.activity_page == 2


def test_validate_analysis_args_with_put_lineup_file_passes(tmp_path: Path) -> None:
    # Arrange
    path = tmp_path / "lineup.json"
    path.write_text("{}", encoding="utf-8")
    args = parse_args(
        ["teams-analysis", "--team-id", "99", "--put-lineup", str(path)],
    )

    # Act / Assert
    validate_analysis_args(args)


# ---- Error paths ---- #


def test_load_put_lineup_invalid_json_raises(tmp_path: Path) -> None:
    # Arrange
    path = tmp_path / "bad.json"
    path.write_text("{", encoding="utf-8")

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="Invalid --put-lineup JSON"):
        load_put_lineup(str(path))


def test_load_put_lineup_non_object_raises(tmp_path: Path) -> None:
    # Arrange
    path = tmp_path / "list.json"
    path.write_text("[1]", encoding="utf-8")

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="must be a JSON object"):
        load_put_lineup(str(path))


def test_parse_args_week_zero_exits() -> None:
    # Arrange / Act / Assert
    with pytest.raises(SystemExit):
        parse_args(["leagues-analysis", "--week", "0"])


def test_validate_analysis_args_put_lineup_without_team_id_raises() -> None:
    # Arrange
    args = Namespace(team_id=None, put_lineup="lineup.json")

    # Act / Assert
    with pytest.raises(BrowserSessionError, match="requires --team-id"):
        validate_analysis_args(args)


# ---- Edge cases ---- #


def test_load_put_lineup_none_returns_none() -> None:
    # Arrange / Act / Assert
    assert load_put_lineup(None) is None
