"""Shared controller helpers for Fantasy payload validation."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ValidationError

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.schemas.payload import as_object, as_object_list
from fantasy_api.services.payload import parse_payload


def as_model[TModel: BaseModel](
    data: object,
    model: type[TModel],
    parser: Callable[[Any], Any] = as_object,
    *,
    allow_empty: bool = False,
) -> TModel:
    """Normalize and validate one upstream JSON object as a Pydantic model.

    Args:
        data: Upstream payload.
        model: Target Pydantic model class.

    Returns:
        The validated model instance.

    Raises:
        UpstreamError: When shape or field validation fails.
    """
    raw = parse_payload(parser, data)
    _require_known_fields(raw, model, allow_empty=allow_empty)
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
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
    validated: list[TModel] = []
    for item in parse_payload(as_object_list, data):
        _require_known_fields(item, model)
        try:
            validated.append(model.model_validate(item))
        except ValidationError as exc:
            raise UpstreamError(
                "fantasy payload had an unexpected shape",
                status_code=502,
                category="fantasy_error",
            ) from exc
    return validated


def _require_known_fields(
    data: object,
    model: type[BaseModel],
    *,
    allow_empty: bool = False,
) -> None:
    """Reject object payloads that contain none of the model's declared keys."""
    fields = model.model_fields
    empty_allowed = allow_empty or getattr(model, "empty_payload_allowed", False)
    if not fields or (not data and empty_allowed):
        return
    if not isinstance(data, dict):
        return
    known_keys = set(fields)
    for _field_name, field in fields.items():
        for alias in (field.alias, field.serialization_alias):
            if isinstance(alias, str):
                known_keys.add(alias)
    if not known_keys.intersection(data):
        raise UpstreamError(
            "fantasy payload had an unexpected shape",
            status_code=502,
            category="fantasy_error",
        )
