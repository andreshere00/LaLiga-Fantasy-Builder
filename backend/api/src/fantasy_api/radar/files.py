"""Bounded JSON and durable atomic writes for offline radar operations."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fantasy_api.schemas.player_radar import RadarSnapshot

MAX_BYTES = 5 * 1024 * 1024


def read_json(path: Path, *, limit: int = MAX_BYTES) -> Any:
    """Read bounded UTF-8 JSON, rejecting oversized input before parsing."""
    with path.open("rb") as stream:
        content = stream.read(limit + 1)
    if len(content) > limit:
        raise ValueError("radar file exceeds byte limit")
    return json.loads(content)


def encode_json(value: Any) -> bytes:
    """Serialize reproducibly without non-finite JSON numbers."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()


def content_id(value: Any) -> str:
    """Hash semantic JSON content independently of formatting."""
    return hashlib.sha256(encode_json(value)).hexdigest()


def atomic_json(path: Path, value: Any) -> None:
    """Replace a JSON file durably; failed writes leave the old file intact."""
    data = encode_json(value)
    if len(data) > MAX_BYTES:
        raise ValueError("radar file exceeds byte limit")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".radar-")
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def semantic_snapshot_id(snapshot: RadarSnapshot) -> str:
    """Hash statistical content without retrieval timestamps or operational flags."""
    return content_id(
        snapshot.model_dump(
            mode="json",
            exclude={
                "snapshot_id",
                "fetched_at",
                "stale",
                "warnings",
            },
        )
    )
