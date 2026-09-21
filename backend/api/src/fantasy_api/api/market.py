"""Market HTTP controller (thin Fantasy proxy for league market and offers)."""

from __future__ import annotations

from fastapi import APIRouter, Header, Path

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.api.payload import parse_payload
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.market import (
    AcceptOfferWrite,
    BidWrite,
    DirectOfferWrite,
    ListingWrite,
    MarketHistoryEntry,
    MarketMutationResult,
    MarketSnapshot,
    PlayerTeamOffers,
)
from fantasy_api.schemas.payload import as_object, as_object_list

router = APIRouter(prefix="/market", tags=["market"])

_AUTH_HEADER = Header(
    default=None,
    description="Bearer internal JWT issued by auth ``POST /auth/token``.",
)


@router.get(
    "/leagues/{league_id}",
    response_model=MarketSnapshot,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get current league market",
)
async def get_market(
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketSnapshot:
    """Return the current market, user bids, and offers for a league."""
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().market_service.get_market(internal_jwt, league_id)
    return MarketSnapshot.model_validate(parse_payload(as_object, data))


@router.get(
    "/leagues/{league_id}/history",
    response_model=list[MarketHistoryEntry],
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get league market history",
)
async def get_market_history(
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> list[MarketHistoryEntry]:
    """Return historical market activity for a league."""
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().market_service.get_market_history(
        internal_jwt,
        league_id,
    )
    items = parse_payload(as_object_list, data)
    return [MarketHistoryEntry.model_validate(item) for item in items]


@router.get(
    "/leagues/{league_id}/player-teams/{player_team_id}/offers",
    response_model=PlayerTeamOffers,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Get offers on an owned squad entry",
)
async def get_player_team_offers(
    league_id: str = Path(description="Fantasy league identifier."),
    player_team_id: str = Path(
        description="Squad-entry id (``playerTeamId``), not master ``playerId``.",
    ),
    authorization: str | None = _AUTH_HEADER,
) -> PlayerTeamOffers:
    """Return offers on a squad entry owned by the caller."""
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().market_service.get_player_team_offers(
        internal_jwt,
        league_id,
        player_team_id,
    )
    return PlayerTeamOffers.model_validate(parse_payload(as_object, data))


@router.post(
    "/leagues/{league_id}/{market_id}/bids",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Create a bid on a market listing",
)
async def create_bid(
    body: BidWrite,
    league_id: str = Path(description="Fantasy league identifier."),
    market_id: str = Path(description="Market listing identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """Create a bid on a market listing."""
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json")
    data = await get_container().market_service.create_bid(
        internal_jwt,
        league_id,
        market_id,
        payload,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))


@router.put(
    "/leagues/{league_id}/{market_id}/bids/{bid_id}",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Modify a bid",
)
async def update_bid(
    body: BidWrite,
    league_id: str = Path(description="Fantasy league identifier."),
    market_id: str = Path(description="Market listing identifier."),
    bid_id: str = Path(description="Bid identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """Modify an existing bid."""
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json")
    data = await get_container().market_service.update_bid(
        internal_jwt,
        league_id,
        market_id,
        bid_id,
        payload,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))


@router.delete(
    "/leagues/{league_id}/{market_id}/bids/{bid_id}",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Cancel a bid",
)
async def cancel_bid(
    league_id: str = Path(description="Fantasy league identifier."),
    market_id: str = Path(description="Market listing identifier."),
    bid_id: str = Path(description="Bid identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """Cancel a bid."""
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().market_service.cancel_bid(
        internal_jwt,
        league_id,
        market_id,
        bid_id,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))


@router.post(
    "/leagues/{league_id}/listings",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="List a player for sale",
)
async def create_listing(
    body: ListingWrite,
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """List a squad entry for sale.

    ``playerId`` in the body is the squad-entry id (``playerTeamId``).
    """
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json")
    data = await get_container().market_service.create_listing(
        internal_jwt,
        league_id,
        payload,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))


@router.delete(
    "/leagues/{league_id}/{market_id}",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Withdraw a market listing",
)
async def delete_listing(
    league_id: str = Path(description="Fantasy league identifier."),
    market_id: str = Path(description="Market listing identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """Withdraw a market listing."""
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().market_service.delete_listing(
        internal_jwt,
        league_id,
        market_id,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))


@router.post(
    "/leagues/{league_id}/{market_id}/offers/{offer_id}/accept",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Accept an offer on a listing",
)
async def accept_offer(
    body: AcceptOfferWrite,
    league_id: str = Path(description="Fantasy league identifier."),
    market_id: str = Path(description="Market listing identifier."),
    offer_id: str = Path(description="Offer identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """Accept an offer on a listing."""
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json")
    data = await get_container().market_service.accept_offer(
        internal_jwt,
        league_id,
        market_id,
        offer_id,
        payload,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))


@router.post(
    "/leagues/{league_id}/{market_id}/offers/{offer_id}/reject",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Reject an offer on a listing",
)
async def reject_offer(
    league_id: str = Path(description="Fantasy league identifier."),
    market_id: str = Path(description="Market listing identifier."),
    offer_id: str = Path(description="Offer identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """Reject an offer on a listing."""
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().market_service.reject_offer(
        internal_jwt,
        league_id,
        market_id,
        offer_id,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))


@router.post(
    "/leagues/{league_id}/direct-offers",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Send a direct offer to another manager",
)
async def create_direct_offer(
    body: DirectOfferWrite,
    league_id: str = Path(description="Fantasy league identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """Send a direct offer to another manager.

    ``playerId`` in the body is the squad-entry id (``playerTeamId``).
    """
    _user, internal_jwt = await get_current_user(authorization)
    payload = body.model_dump(mode="json")
    data = await get_container().market_service.create_direct_offer(
        internal_jwt,
        league_id,
        payload,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))


@router.delete(
    "/leagues/{league_id}/{market_id}/offers/{offer_id}",
    response_model=MarketMutationResult,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    summary="Cancel an offer",
)
async def cancel_offer(
    league_id: str = Path(description="Fantasy league identifier."),
    market_id: str = Path(description="Market listing identifier."),
    offer_id: str = Path(description="Offer identifier."),
    authorization: str | None = _AUTH_HEADER,
) -> MarketMutationResult:
    """Cancel an offer."""
    _user, internal_jwt = await get_current_user(authorization)
    data = await get_container().market_service.cancel_offer(
        internal_jwt,
        league_id,
        market_id,
        offer_id,
    )
    return MarketMutationResult.model_validate(parse_payload(as_object, data))
