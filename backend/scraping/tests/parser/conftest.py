"""Pytest hooks for the parser suite."""

import os

import pytest


def pytest_addoption(parser: pytest.Parser) -> None:
    """Register the golden-file update flag."""
    parser.addoption("--update-golden", action="store_true", default=False)


def pytest_configure(config: pytest.Config) -> None:
    """Refuse golden updates in CI."""
    if config.getoption("--update-golden") and os.environ.get("CI") == "true":
        raise pytest.UsageError("refusing --update-golden when CI=true")
