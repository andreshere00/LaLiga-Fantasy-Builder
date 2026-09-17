"""Shared controller helpers for Fantasy payload validation."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.schemas.payload import as_object_list


def parse_payload[T](parser: Callable[[Any], T], data: object) -> T:
    """Run a payload parser and map shape errors to UpstreamError.

    Args:
        parser: Callable that raises ``ValueError`` on bad shapes.
        data: Upstream JSON.

    Returns:
        Parsed value.

    Raises:
        UpstreamError: When the payload shape is unexpected.
    """
    try:
        return parser(data)
    except ValueError as exc:
        raise UpstreamError(
            "fantasy payload had an unexpected shape",
            status_code=502,
            category="fantasy_error",
        ) from exc


def as_model_list[TModel: BaseModel](
    data: object,
    model: type[TModel],
) -> list[TModel]:
    """Coerce upstream JSON into a list of Pydantic models.

    Args:
        data: Upstream payload (list or wrapped object).
        model: Target model class.

    Returns:
        Validated model list.

    Raises:
        UpstreamError: When the payload is not a collection of objects.
    """
    return [model.model_validate(item) for item in parse_payload(as_object_list, data)]
