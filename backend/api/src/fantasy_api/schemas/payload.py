"""Shared Fantasy JSON payload normalizers."""

from __future__ import annotations

from typing import Any

_COLLECTION_WRAPPER_KEYS: tuple[str, ...] = (
    "leagues",
    "standing",
    "standings",
    "teams",
    "activity",
    "items",
    "data",
    "players",
)


def as_object(data: Any) -> dict[str, Any]:
    """Require a JSON object payload.

    Args:
        data: Upstream JSON.

    Returns:
        The same mapping when ``data`` is an object.

    Raises:
        ValueError: When the payload is not a JSON object.
    """
    if isinstance(data, dict):
        return data
    raise ValueError("expected a JSON object")


def as_object_list(data: Any) -> list[dict[str, Any]]:
    """Normalize Fantasy JSON to a list of objects.

    Accepts a JSON array, an object wrapping an array under a known key, or a
    single object (treated as a one-element collection).

    Args:
        data: Upstream JSON.

    Returns:
        List of JSON objects.

    Raises:
        ValueError: When the payload is not a collection of objects.
    """
    if isinstance(data, list):
        raw_items = data
    elif isinstance(data, dict):
        raw_items = _unwrap_collection(data)
    else:
        raise ValueError("expected a JSON array or object")

    items: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            raise ValueError("expected objects in JSON array")
        items.append(item)
    return items


def _unwrap_collection(data: dict[str, Any]) -> list[Any]:
    """Return a nested array or the object itself as a one-element list."""
    for key in _COLLECTION_WRAPPER_KEYS:
        if key not in data:
            continue
        nested = data[key]
        if not isinstance(nested, list):
            raise ValueError(f"expected {key} to be a JSON array")
        return nested
    return [data]
