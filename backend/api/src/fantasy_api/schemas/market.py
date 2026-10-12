"""Market and offers schemas for OpenAPI / Swagger."""

from __future__ import annotations

from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from fantasy_api.schemas.common import FantasyWireModel, FantasyWriteModel
from fantasy_api.schemas.leagues import PlayerMaster


class MarketBid(FantasyWireModel):
    """Bid or offer row nested in a market response."""

    id: str | int | None = None
    money: int | None = None
    status: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class MarketListing(FantasyWireModel):
    """Player listing nested in a market snapshot."""

    id: str | int | None = None
    league_id: str | int | None = None
    league_type: str | int | None = None
    direct_offer: bool | None = None
    discr: str | None = None
    expiration_date: str | None = None
    number_of_bids: int | None = None
    number_of_offers: int | None = None
    bid: MarketBid | None = None
    player_master: PlayerMaster | None = None


class MarketSnapshot(FantasyWireModel):
    """Current league market from ``GET /market/leagues/{leagueId}``."""

    market_players: list[MarketListing] | None = None
    user_bids: list[MarketBid] | None = None


class MarketOffer(FantasyWireModel):
    """Offer row returned for an owned squad entry."""

    id: str | int | None = None
    money: int | None = None
    status: str | None = None
    bidder_id: str | int | None = None
    created_at: str | None = None


class MarketHistoryEntry(FantasyWireModel):
    """One league market history row."""

    id: str | int | None = None


class PlayerTeamOffers(FantasyWireModel):
    """Offers on an owned squad entry."""

    empty_payload_allowed: ClassVar[bool] = True

    offers: list[MarketOffer] | None = None
    bids: list[MarketBid] | None = None


class MarketMutationResult(FantasyWireModel):
    """Response from market write endpoints (may be empty)."""

    empty_payload_allowed: ClassVar[bool] = True
    ok: bool | None = None
    id: str | int | None = None
    status: str | None = None
    message: str | None = None
    market_id: str | int | None = None
    bid_id: str | int | None = None
    offer_id: str | int | None = None
    sold: bool | None = None


class BidWrite(BaseModel):
    """Request body for bid create/update."""

    model_config = ConfigDict(extra="forbid")

    money: int = Field(strict=True, gt=0)


MAX_SALE_PRICE = 999_999_999


class ListingWrite(FantasyWriteModel):
    """Request body for ``POST /market/leagues/{leagueId}/listings``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id. ``salePrice`` is a whole-euro offer, at most
    ``MAX_SALE_PRICE``. The caller must also keep it at or above the player's
    current market value.
    """

    player_id: str | int
    sale_price: int = Field(strict=True, gt=0, le=MAX_SALE_PRICE)


class ImmediateSaleWrite(FantasyWriteModel):
    """Request body for ``POST /market/leagues/{leagueId}/immediate-sales``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id. Fantasy sets the price at half the current market value
    and credits the balance.
    """

    player_id: str | int


class DirectOfferWrite(FantasyWriteModel):
    """Request body for ``POST /market/leagues/{leagueId}/direct-offers``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id.
    """

    player_id: str | int
    money: int = Field(strict=True, gt=0)


class AcceptOfferWrite(FantasyWriteModel):
    """Request body for accepting an offer on a listing."""

    offer_money: int = Field(strict=True, gt=0)
