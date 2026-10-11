"""Shared controller helpers for Fantasy payload validation."""

from __future__ import annotations

from pydantic import BaseModel, ValidationError

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.schemas.payload import as_object_list
from fantasy_api.services.payload import parse_payload


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
        try:
            validated.append(model.model_validate(item))
        except ValidationError as exc:
            raise UpstreamError(
                "fantasy payload had an unexpected shape",
                status_code=502,
                category="fantasy_error",
            ) from exc
    return validated
