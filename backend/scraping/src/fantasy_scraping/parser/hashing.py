"""Canonical JSON and content hashes. Field order follows the Pydantic models."""

import hashlib

from pydantic import BaseModel


def canonical_json(model: BaseModel) -> str:
    """Return compact UTF-8 JSON in model field order.

    Args:
        model: Parser output model.

    Returns:
        JSON text with no ASCII escaping.
    """
    return model.model_dump_json(by_alias=True)


def content_hash(model: BaseModel) -> str:
    """Hash the canonical JSON of ``model``, ignoring ``content_hash`` itself.

    Args:
        model: Model whose identity should be stable across processes.

    Returns:
        Lower-case SHA-256 hex digest.
    """
    payload = model.model_dump_json(by_alias=True, exclude={"content_hash"})
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def input_hash(html: str) -> str:
    """Hash the HTML bytes the parser received.

    Args:
        html: Page body decoded as text.

    Returns:
        Lower-case SHA-256 hex digest of the UTF-8 bytes.
    """
    return hashlib.sha256(html.encode("utf-8")).hexdigest()
