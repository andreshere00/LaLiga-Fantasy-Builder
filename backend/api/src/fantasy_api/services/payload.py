"""Payload parsing shared by API services and controllers."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fantasy_api.domain.errors import UpstreamError


def parse_payload[T](parser: Callable[[Any], T], data: object) -> T:
    """Run a payload parser and map shape errors to a stable upstream error."""
    try:
        return parser(data)
    except ValueError as exc:
        raise UpstreamError(
            "fantasy payload had an unexpected shape",
            status_code=502,
            category="fantasy_error",
        ) from exc
