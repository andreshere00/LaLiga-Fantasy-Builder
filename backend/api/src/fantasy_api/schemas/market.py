"""Market and offers schemas for OpenAPI / Swagger."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from fantasy_api.schemas.common import FlexibleModel


class MarketSnapshot(FlexibleModel):
    """Current league market from ``GET /market/leagues/{leagueId}``."""


class MarketHistoryEntry(FlexibleModel):
    """One league market history row."""

    id: str | int | None = None


class PlayerTeamOffers(FlexibleModel):
    """Offers on an owned squad entry."""


class MarketMutationResult(FlexibleModel):
    """Response from market write endpoints (may be empty)."""


class BidWrite(BaseModel):
    """Request body for bid create/update."""

    model_config = ConfigDict(extra="forbid")

    money: int = Field(gt=0)


class ListingWrite(BaseModel):
    """Request body for ``POST /market/leagues/{leagueId}/listings``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id.
    """

    model_config = ConfigDict(extra="forbid")

    playerId: str | int
    salePrice: int = Field(gt=0)


class DirectOfferWrite(BaseModel):
    """Request body for ``POST /market/leagues/{leagueId}/direct-offers``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id.
    """

    model_config = ConfigDict(extra="forbid")

    playerId: str | int
    money: int = Field(gt=0)


class AcceptOfferWrite(BaseModel):
    """Request body for accepting an offer on a listing."""

    model_config = ConfigDict(extra="forbid")

    offerMoney: int = Field(gt=0)
