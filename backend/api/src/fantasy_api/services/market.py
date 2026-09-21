"""Market application service."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.auth_credentials import AuthCredentialsClient
from fantasy_api.repositories.market import MarketRepository
from fantasy_api.services.laliga import with_laliga_bearer


class MarketService:
    """Orchestrate LaLiga bearer fetch and market repository calls.

    Args:
        credentials: Auth private credentials client.
        repository: Market repository.
    """

    def __init__(
        self,
        credentials: AuthCredentialsClient,
        repository: MarketRepository,
    ) -> None:
        self._credentials = credentials
        self._repository = repository

    async def get_market(self, internal_jwt: str, league_id: str) -> Any:
        """Return the current league market snapshot."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.get_market,
            league_id,
        )

    async def get_market_history(self, internal_jwt: str, league_id: str) -> Any:
        """Return league market history."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.get_market_history,
            league_id,
        )

    async def get_player_team_offers(
        self,
        internal_jwt: str,
        league_id: str,
        player_team_id: str,
    ) -> Any:
        """Return offers on an owned squad entry."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.get_player_team_offers,
            league_id,
            player_team_id,
        )

    async def create_bid(
        self,
        internal_jwt: str,
        league_id: str,
        market_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Create a bid on a market listing."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.create_bid,
            league_id,
            market_id,
            body,
        )

    async def update_bid(
        self,
        internal_jwt: str,
        league_id: str,
        market_id: str,
        bid_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Modify an existing bid."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.update_bid,
            league_id,
            market_id,
            bid_id,
            body,
        )

    async def cancel_bid(
        self,
        internal_jwt: str,
        league_id: str,
        market_id: str,
        bid_id: str,
    ) -> Any:
        """Cancel a bid."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.cancel_bid,
            league_id,
            market_id,
            bid_id,
        )

    async def create_listing(
        self,
        internal_jwt: str,
        league_id: str,
        body: dict[str, Any],
    ) -> Any:
        """List a player for sale."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.create_listing,
            league_id,
            body,
        )

    async def delete_listing(
        self,
        internal_jwt: str,
        league_id: str,
        market_id: str,
    ) -> Any:
        """Withdraw a market listing."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.delete_listing,
            league_id,
            market_id,
        )

    async def accept_offer(
        self,
        internal_jwt: str,
        league_id: str,
        market_id: str,
        offer_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Accept an offer on a listing."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.accept_offer,
            league_id,
            market_id,
            offer_id,
            body,
        )

    async def reject_offer(
        self,
        internal_jwt: str,
        league_id: str,
        market_id: str,
        offer_id: str,
    ) -> Any:
        """Reject an offer on a listing."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.reject_offer,
            league_id,
            market_id,
            offer_id,
        )

    async def create_direct_offer(
        self,
        internal_jwt: str,
        league_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Send a direct offer to another manager."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.create_direct_offer,
            league_id,
            body,
        )

    async def cancel_offer(
        self,
        internal_jwt: str,
        league_id: str,
        market_id: str,
        offer_id: str,
    ) -> Any:
        """Cancel an offer."""
        return await with_laliga_bearer(
            self._credentials,
            internal_jwt,
            self._repository.cancel_offer,
            league_id,
            market_id,
            offer_id,
        )
