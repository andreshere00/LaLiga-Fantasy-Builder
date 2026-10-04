"""Rule loading and model coverage."""

from pathlib import Path
from types import UnionType
from typing import Union, get_args, get_origin

import pytest
from pydantic import BaseModel

from fantasy_scraping.parser.models.futbolfantasy import FutbolFantasyPlayer
from fantasy_scraping.parser.rules.loader import RuleRepository, _compile, load_rules

# ---- Mocks, fixtures & helpers ---- #

RULES = Path(__file__).parents[2] / "src" / "fantasy_scraping" / "parser" / "rules"


def _unwrap(annotation: object) -> object:
    origin = get_origin(annotation)
    if origin in {Union, UnionType}:
        args = [item for item in get_args(annotation) if item is not type(None)]
        if len(args) == 1:
            return _unwrap(args[0])
    return annotation


def _leaves(model: type[BaseModel], prefix: str = "") -> set[str]:
    found: set[str] = set()
    for name, field in model.model_fields.items():
        path = f"{prefix}.{name}" if prefix else name
        inner = _unwrap(field.annotation)
        origin = get_origin(inner)
        args = get_args(inner)
        if isinstance(inner, type) and issubclass(inner, BaseModel):
            found |= _leaves(inner, path)
            continue
        found.add(path)
        if origin is list and args:
            arg = _unwrap(args[0])
            if isinstance(arg, type) and issubclass(arg, BaseModel):
                found |= _leaves(arg, path)
    return found


def _covers(path: str, item: str) -> bool:
    if item.endswith("*"):
        return path.startswith(item[:-1])
    return path == item or path.startswith(item + ".")


# ---- Happy path ---- #


def test_load_rules_packaged_files_validate() -> None:
    rules = RuleRepository().load()
    assert rules.version == "1"
    assert RuleRepository().load() is rules


def test_rules_cover_model_leaves() -> None:
    rules = load_rules(RULES)
    leaves = _leaves(FutbolFantasyPlayer)
    covered: set[str] = set()
    for rule in rules.rules:
        covered.add(rule.target_path)
    for label in rules.labels:
        covered.add(label.path)
    for table in rules.tables:
        covered.add(table.target_path)
        for column in table.columns:
            covered.add(f"{table.target_path}.{column.id}")
    for item in [*rules.derivations, *rules.unmapped_allowlist]:
        covered |= {path for path in leaves if _covers(path, item)}
    missing = sorted(leaves - covered)
    assert missing == []


# ---- Error paths ---- #


def test_compile_rejects_unknown_locator_kind() -> None:
    with pytest.raises(ValueError):
        _compile("text:nombre")


def test_compile_accepts_xpath_and_label_locators() -> None:
    _compile("xpath://h1")
    _compile("label:Nombre|Apellido")
    with pytest.raises(ValueError):
        _compile("label:")


def test_compile_rejects_bad_css() -> None:
    from cssselect.parser import SelectorSyntaxError

    with pytest.raises(SelectorSyntaxError):
        _compile("css:[[[")


# ---- Edge cases ---- #


def test_event_labels_and_competition_prefixes_are_unique() -> None:
    rules = load_rules(RULES)
    labels = [event.label.casefold() for event in rules.events]
    assert len(labels) == len(set(labels))
    prefixes = [item.prefix.casefold() for item in rules.competitions]
    assert len(prefixes) == len(set(prefixes))
