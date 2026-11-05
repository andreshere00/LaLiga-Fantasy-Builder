"""Application-owned favorites, watch preferences and persistent inbox contracts."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from pydantic.alias_generators import to_camel

Identifier = Annotated[str, StringConstraints(min_length=1, max_length=128, pattern=r"^[^/\s?#]+$")]
PlayerId = Annotated[str, StringConstraints(pattern=r"^[0-9]{1,10}$")]


class ScoutingModel(BaseModel):
    """Camel-case application wire format with Python-native field names."""

    model_config = ConfigDict(extra="allow", alias_generator=to_camel, populate_by_name=True)


class WatchWrite(ScoutingModel):
    """Full replacement of a player's alert preferences in one league."""

    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True)
    market_alert: bool = Field(strict=True)
    clause_alert: bool = Field(strict=True)
    lead_hours: Literal[1, 6, 24] = 24

    @field_validator("lead_hours", mode="before")
    @classmethod
    def _strict_hours(cls, value: object) -> object:
        """Reject booleans/strings instead of silently interpreting them as hours."""
        if type(value) is not int:
            raise ValueError("leadHours must be an integer")
        return value


class FavoritesImport(ScoutingModel):
    """Idempotent union of legacy device favorites, without enabling watches."""

    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True)
    player_ids: list[PlayerId] = Field(max_length=1000)


class Observation(ScoutingModel):
    """Last successful read; unknown protection data never implies availability."""

    name: str
    listings: list[str] = Field(default_factory=list)
    owner_id: str | None = None
    owner_name: str | None = None
    player_team_id: str | None = None
    unlock_at: datetime | None = None
    shielded: bool | None = None
    clause: int | None = None
    clause_enabled: bool = False
    rival: bool = False
    available: bool = False
    checked_at: datetime
    cycle: str = ""
    episode: str = ""


class Favorite(ScoutingModel):
    """Global favorite with optional context from the requested league."""

    player_id: str
    created_at: datetime
    watch: WatchWrite | None = None
    observation: Observation | None = None


class FavoritesResponse(ScoutingModel):
    """Favorites newest first and monitoring health for the requested league."""

    favorites: list[Favorite]
    status: Literal["inactive", "active", "needs_reauth", "not_member", "degraded"] = "inactive"
    checked_at: datetime | None = None


class ScoutingNotification(ScoutingModel):
    """One detected event, retained after removing a favorite."""

    id: str
    league_id: str
    league_name: str
    player_id: str
    player_name: str
    kind: Literal["market", "clause_soon", "clause_available"]
    created_at: datetime
    read_at: datetime | None = None


class InboxResponse(ScoutingModel):
    """Cursor-paginated inbox and total unread count across leagues."""

    notifications: list[ScoutingNotification]
    unread_count: int
    next_cursor: str | None = None


class ScoutingResult(ScoutingModel):
    """Acknowledged application write."""

    ok: bool = True
