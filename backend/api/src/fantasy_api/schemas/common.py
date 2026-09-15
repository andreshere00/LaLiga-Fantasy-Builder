"""Shared OpenAPI / API response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    """Stable API error body returned by exception handlers.

    Attributes:
        error: Machine-readable error category.
        detail: Human-readable explanation (never contains tokens).
    """

    error: str
    detail: str


class HealthResponse(BaseModel):
    """Liveness / readiness payload."""

    status: str = Field(examples=["ok"])


class MeResponse(BaseModel):
    """Public view of the authenticated API caller."""

    user_id: str
    email: str | None = None
    name: str | None = None


class LaligaCredentialProbeResponse(BaseModel):
    """Probe that auth returned a LaLiga bearer (token redacted)."""

    user_id: str
    has_bearer: bool
    expires_at: int


class FlexibleModel(BaseModel):
    """Base model that preserves unknown Fantasy fields in OpenAPI/docs."""

    model_config = ConfigDict(extra="allow")
