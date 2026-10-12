"""Validated Fantasy provider inputs consumed by player statistics."""

from datetime import date, datetime

from pydantic import Field, field_validator, model_validator

from fantasy_api.schemas.common import FantasyWireModel


class TeamsMasterRow(FantasyWireModel):
    """Club metadata used to build the club directory."""

    id: int | None = Field(default=None, gt=0)
    dsp_id: int | None = Field(default=None, gt=0)
    name: str
    short_name: str | None = None
    slug: str | None = None

    @model_validator(mode="after")
    def require_identifier(self) -> "TeamsMasterRow":
        """Require an identifier before domain lookup."""
        if self.id is None and self.dsp_id is None:
            raise ValueError("club identifier required")
        return self


class MarketHistoryPoint(FantasyWireModel):
    """Dated whole-euro market sample, accepting provider numeric strings."""

    date: datetime | date
    market_value: int = Field(ge=0)

    @field_validator("date", mode="before")
    @classmethod
    def require_iso_date(cls, value: object) -> object:
        """Reject epoch coercion for the provider's ISO date field."""
        if isinstance(value, str):
            value = value.strip()
            if len(value) < 10 or value[4] != "-" or value[7] != "-":
                raise ValueError("ISO date required")
        elif not isinstance(value, date):
            raise ValueError("ISO date required")
        return value

    @field_validator("market_value", mode="before")
    @classmethod
    def reject_boolean(cls, value: object) -> object:
        """Reject boolean amounts rather than converting them to euros."""
        if isinstance(value, bool):
            raise ValueError("whole-euro amount required")
        return value
