# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import ast
import re
from pathlib import Path

SNAKE_CASE = re.compile(r"^[a-z][a-z0-9_]*$")


def _schema_sources() -> list[Path]:
    """Return Python modules that declare endpoint and nested Pydantic DTOs."""
    root = Path(__file__).resolve().parents[3]
    return sorted(root.glob("backend/*/src/**/*.py"))


def _class_fields(tree: ast.Module, model_names: set[str]) -> list[str]:
    """Return annotated class attributes declared by schema classes."""
    names: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef) or node.name not in model_names:
            continue
        for child in node.body:
            if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):
                names.append(child.target.id)
    return names


# ---- Happy path ---- #


def test_pydantic_model_fields_use_snake_case() -> None:
    violations: list[str] = []
    trees = {path: ast.parse(path.read_text(encoding="utf-8")) for path in _schema_sources()}
    model_names = {"BaseModel", "BaseSettings"}
    for tree in trees.values():
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module in {
                "pydantic",
                "pydantic_settings",
            }:
                model_names.update(
                    alias.asname or alias.name
                    for alias in node.names
                    if alias.name in {"BaseModel", "BaseSettings"}
                )
    while True:
        discovered = {
            node.name
            for tree in trees.values()
            for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef)
            and any(isinstance(base, ast.Name) and base.id in model_names for base in node.bases)
        }
        if discovered.issubset(model_names):
            break
        model_names.update(discovered)
    for path, tree in trees.items():
        violations.extend(
            f"{path.relative_to(Path(__file__).resolve().parents[3])}:{name}"
            for name in _class_fields(tree, model_names)
            if not SNAKE_CASE.fullmatch(name)
        )

    assert violations == []
