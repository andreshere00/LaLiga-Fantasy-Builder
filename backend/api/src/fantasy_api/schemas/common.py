"""Shared OpenAPI / API response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]
type JsonObject = dict[str, JsonValue]


class ErrorResponse(BaseModel):
    """Stable API error body returned by exception handlers.

    Attributes:
        error: Machine-readable error category.
        detail: Human-readable explanation (never contains tokens).
    """

    model_config = ConfigDict(extra="forbid")

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


class FantasyWireModel(FlexibleModel):
    """Fantasy read model with snake_case Python fields and camelCase wire aliases."""

    model_config = ConfigDict(
        extra="allow",
        alias_generator=to_camel,
        populate_by_name=True,
    )

    @model_validator(mode="before")
    @classmethod
    def reject_alias_collisions(cls, value: object) -> object:
        """Reject ambiguous declared field aliases."""
        if isinstance(value, dict):
            for name, field in cls.model_fields.items():
                if field.alias and field.alias != name and name in value and field.alias in value:
                    raise ValueError("ambiguous field aliases")
        return value


class FantasyWriteModel(BaseModel):
    """Strict Fantasy write model with snake_case fields and camelCase aliases."""

    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
    )
