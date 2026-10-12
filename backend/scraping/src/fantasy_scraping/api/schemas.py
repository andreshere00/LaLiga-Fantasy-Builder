"""Validated JSON contracts for scraping API responses."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, StrictStr


class ErrorResponse(BaseModel):
    """Sanitized scraping error returned by route exception handlers."""

    model_config = ConfigDict(extra="forbid")

    error: StrictStr
    detail: StrictStr | None = None
    candidates: list[StrictStr] | None = None
