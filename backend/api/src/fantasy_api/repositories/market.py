"""Repository for LaLiga Fantasy league market and offer resources."""

from __future__ import annotations

from typing import Any

from fantasy_api.clients.laliga_fantasy import LaligaFantasyClient
from fantasy_api.repositories.paths import competition_path


class MarketRepository:
    """Build competition league market paths and call the Fantasy HTTP client.

    Args:
        client: Shared Fantasy HTTP client.
        competition_id: Competition id in Fantasy paths (default ``1``).
    """

    def __init__(
        self,
        client: LaligaFantasyClient,
        *,
        competition_id: int = 1,
    ) -> None:
        self._client = client
        self._competition_id = competition_id

    def _league_path(self, league_id: str, *parts: str | int) -> str:
        """Build a path under ``{CMP}/league/{leagueId}/...``."""
        return competition_path(self._competition_id, "league", league_id, *parts)

    async def get_market(self, bearer_token: str, league_id: str) -> Any:
        """Fetch the current league market snapshot."""
        return await self._client.get_json(
            self._league_path(league_id, "market"),
            bearer_token,
        )

    async def get_market_history(self, bearer_token: str, league_id: str) -> Any:
        """Fetch league market history."""
        return await self._client.get_json(
            self._league_path(league_id, "market", "history"),
            bearer_token,
        )

    async def get_player_team_offers(
        self,
        bearer_token: str,
        league_id: str,
        player_team_id: str,
    ) -> Any:
        """Fetch offers on an owned squad entry."""
        path = self._league_path(league_id, "playerTeam", player_team_id, "offer")
        return await self._client.get_json(path, bearer_token)

    async def create_bid(
        self,
        bearer_token: str,
        league_id: str,
        market_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Create a bid on a market listing."""
        path = self._league_path(league_id, "market", market_id, "bid")
        return await self._client.post_json(path, bearer_token, body)

    async def update_bid(
        self,
        bearer_token: str,
        league_id: str,
        market_id: str,
        bid_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Modify an existing bid."""
        path = self._league_path(league_id, "market", market_id, "bid", bid_id)
        return await self._client.put_json(path, bearer_token, body)

    async def cancel_bid(
        self,
        bearer_token: str,
        league_id: str,
        market_id: str,
        bid_id: str,
    ) -> Any:
        """Cancel a bid."""
        path = self._league_path(
            league_id,
            "market",
            market_id,
            "bid",
            bid_id,
            "cancel",
        )
        return await self._client.delete_json(path, bearer_token)

    async def create_listing(
        self,
        bearer_token: str,
        league_id: str,
        body: dict[str, Any],
    ) -> Any:
        """List a player for sale."""
        path = self._league_path(league_id, "market", "sell")
        return await self._client.post_json(path, bearer_token, body)

    async def delete_listing(
        self,
        bearer_token: str,
        league_id: str,
        market_id: str,
    ) -> Any:
        """Withdraw a market listing."""
        path = self._league_path(league_id, "market", market_id, "delete")
        return await self._client.delete_json(path, bearer_token)

    async def accept_offer(
        self,
        bearer_token: str,
        league_id: str,
        market_id: str,
        offer_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Accept an offer on a listing."""
        path = self._league_path(
            league_id,
            "market",
            market_id,
            "offer",
            offer_id,
            "accept",
        )
        return await self._client.post_json(path, bearer_token, body)

    async def reject_offer(
        self,
        bearer_token: str,
        league_id: str,
        market_id: str,
        offer_id: str,
    ) -> Any:
        """Reject an offer on a listing."""
        path = self._league_path(
            league_id,
            "market",
            market_id,
            "offer",
            offer_id,
            "reject",
        )
        return await self._client.post_json(path, bearer_token)

    async def create_direct_offer(
        self,
        bearer_token: str,
        league_id: str,
        body: dict[str, Any],
    ) -> Any:
        """Send a direct offer to another manager."""
        path = self._league_path(league_id, "market", "direct-offer")
        return await self._client.post_json(path, bearer_token, body)

    async def cancel_offer(
        self,
        bearer_token: str,
        league_id: str,
        market_id: str,
        offer_id: str,
    ) -> Any:
        """Cancel an offer."""
        path = self._league_path(
            league_id,
            "market",
            market_id,
            "offer",
            offer_id,
            "cancel",
        )
        return await self._client.delete_json(path, bearer_token)
