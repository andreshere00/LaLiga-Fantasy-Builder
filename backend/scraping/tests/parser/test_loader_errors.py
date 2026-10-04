"""Rule loader validation failures."""

import shutil
from pathlib import Path

import pytest

from fantasy_scraping.parser.rules.loader import _check_labels, _check_rules, load_rules
from fantasy_scraping.parser.rules.schema import ExtractRule, LabelRule

RULES_SRC = Path(__file__).parents[2] / "src" / "fantasy_scraping" / "parser" / "rules"

# ---- Error paths ---- #


def test_check_rules_rejects_duplicate_and_bad_normaliser() -> None:
    rule = ExtractRule(
        id="a",
        target_path="meta.url",
        locator="css:body",
        normaliser="clean_text",
    )
    _check_rules([rule])
    with pytest.raises(ValueError, match="duplicate"):
        _check_rules([rule, rule.model_copy()])
    with pytest.raises(ValueError, match="unknown normaliser"):
        _check_rules([rule.model_copy(update={"normaliser": "missing"})])
    with pytest.raises(ValueError, match="invalid required"):
        _check_rules([rule.model_copy(update={"required": "maybe"})])


def test_check_labels_rejects_duplicate_and_unknown_normaliser() -> None:
    row = LabelRule(label="Goles", path="season_stats.attack.goals", normaliser="es_int")
    _check_labels([row])
    with pytest.raises(ValueError, match="duplicate"):
        _check_labels([row, row])
    with pytest.raises(ValueError, match="unknown normaliser"):
        _check_labels([row.model_copy(update={"normaliser": "nope"})])


def test_load_rules_duplicate_competition_raises(tmp_path: Path) -> None:
    for item in RULES_SRC.glob("*.toml"):
        shutil.copy(item, tmp_path / item.name)
    competitions = (tmp_path / "competitions.toml").read_text(encoding="utf-8")
    (tmp_path / "competitions.toml").write_text(competitions + competitions, encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate"):
        load_rules(tmp_path)


def test_load_rules_duplicate_event_raises(tmp_path: Path) -> None:
    for item in RULES_SRC.glob("*.toml"):
        shutil.copy(item, tmp_path / item.name)
    events = (tmp_path / "events.toml").read_text(encoding="utf-8")
    (tmp_path / "events.toml").write_text(events + events, encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate"):
        load_rules(tmp_path)


def test_load_rules_invalid_schema_raises(tmp_path: Path) -> None:
    (tmp_path / "futbolfantasy.toml").write_text(
        'version = "1"\nselectors = { identity_name = "css:h1" }\n',
        encoding="utf-8",
    )
    (tmp_path / "labels.es.toml").write_text("", encoding="utf-8")
    (tmp_path / "events.toml").write_text("", encoding="utf-8")
    (tmp_path / "competitions.toml").write_text("", encoding="utf-8")
    (tmp_path / "stat_slugs.toml").write_text("", encoding="utf-8")
    (tmp_path / "static_blocks.es.toml").write_text('version = "1"\n', encoding="utf-8")
    with pytest.raises(ValueError, match="schema"):
        load_rules(tmp_path)
