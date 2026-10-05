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


MAX_SALE_PRICE = 999_999_999


class ListingWrite(BaseModel):
    """Request body for ``POST /market/leagues/{leagueId}/listings``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id. ``salePrice`` is a whole-euro offer, at most
    ``MAX_SALE_PRICE``. The caller must also keep it at or above the player's
    current market value.
    """

    model_config = ConfigDict(extra="forbid")

    playerId: str | int
    salePrice: int = Field(gt=0, le=MAX_SALE_PRICE)


class ImmediateSaleWrite(BaseModel):
    """Request body for ``POST /market/leagues/{leagueId}/immediate-sales``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id. Fantasy sets the price at half the current market value
    and credits the balance.
    """

    model_config = ConfigDict(extra="forbid")

    playerId: str | int


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
