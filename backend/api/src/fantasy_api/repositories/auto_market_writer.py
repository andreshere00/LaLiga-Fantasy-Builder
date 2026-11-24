"""The only Fantasy writes the auto-market worker may perform, each validated like its route."""

from __future__ import annotations

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.repositories.buyout import BuyoutRepository
from fantasy_api.repositories.market import MarketRepository
from fantasy_api.schemas.buyout import PayBuyoutWrite
from fantasy_api.schemas.market import AcceptOfferWrite, BidWrite, ListingWrite


class AutoMarketWriter:
    """List, accept an offer, bid, or pay a clause. Nothing else: no shields or increases."""

    def __init__(self, client: LaligaFantasyClient, competition_id: int) -> None:
        self._market = MarketRepository(client, competition_id=competition_id)
        self._buyout = BuyoutRepository(client, competition_id=competition_id)

    async def list_player(self, bearer: str, league: str, entry: str, price: int) -> None:
        """List a squad entry for sale at a whole-euro asking price."""
        body = ListingWrite(player_id=entry, sale_price=price)
        await self._market.create_listing(
            bearer, league, body.model_dump(mode="json", by_alias=True)
        )

    async def accept_offer(
        self, bearer: str, league: str, market_id: str, offer_id: str, money: int
    ) -> None:
        """Accept one offer at the amount that was read for it."""
        body = AcceptOfferWrite(offer_money=money)
        await self._market.accept_offer(
            bearer, league, market_id, offer_id, body.model_dump(mode="json", by_alias=True)
        )

    async def place_bid(self, bearer: str, league: str, market_id: str, money: int) -> None:
        """Place a first bid on a market listing."""
        body = BidWrite(money=money)
        await self._market.create_bid(
            bearer, league, market_id, body.model_dump(mode="json", by_alias=True)
        )

    async def pay_clause(self, bearer: str, league: str, entry: str, clause: int) -> None:
        """Pay the release clause that was read for a rival's squad entry."""
        body = PayBuyoutWrite(buyout_clause_to_pay=clause)
        await self._buyout.pay_buyout(
            bearer, league, entry, body.model_dump(mode="json", by_alias=True)
        )
