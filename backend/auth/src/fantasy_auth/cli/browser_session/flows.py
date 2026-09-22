"""API analysis flows for the browser-session CLI."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from fantasy_auth.cli.browser_session.args import load_put_lineup
from fantasy_auth.cli.browser_session.errors import BrowserSessionError
from fantasy_auth.cli.browser_session.http import FantasyClient
from fantasy_auth.cli.session_analysis import (
    fetch_buyout_analysis,
    fetch_leagues_analysis,
    fetch_market_analysis,
    fetch_teams_analysis,
)


def fetch_league_player(
    *,
    api_base: str,
    jwt: str,
    player_id: str,
    league_id: str | None,
    transport: httpx.BaseTransport | None = None,
) -> Any:
    """GET /leagues then GET /players/{id}/league/{league_id}.

    Args:
        api_base: Fantasy Builder API origin.
        jwt: Internal JWT.
        player_id: Master player id.
        league_id: Optional league id (default: first from /leagues).
        transport: Optional httpx transport (tests).

    Returns:
        League player JSON.

    Raises:
        BrowserSessionError: When no league id is available.
    """
    api = FantasyClient(base_url=api_base, jwt=jwt, transport=transport)
    leagues = api.get_json("/leagues")
    resolved = league_id or first_league_id(leagues)
    if not resolved:
        raise BrowserSessionError("No league id in GET /leagues; pass --league-id")
    pid = quote(str(player_id), safe="")
    lid = quote(str(resolved), safe="")
    return api.get_json(f"/players/{pid}/league/{lid}")


def run_leagues_analysis(
    *,
    api_base: str,
    jwt: str,
    league_id: str | None,
    week: int | None,
    activity_page: int,
    team_id: str | None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """Fetch the leagues analysis bundle via the local API.

    Args:
        api_base: Fantasy Builder API origin.
        jwt: Internal JWT.
        league_id: Optional league filter.
        week: Optional matchweek.
        activity_page: Activity page index.
        team_id: Optional squad id.
        transport: Optional httpx transport (tests).

    Returns:
        Aggregated leagues JSON.
    """
    api = FantasyClient(base_url=api_base, jwt=jwt, transport=transport)
    return fetch_leagues_analysis(
        get_json=api.get_json,
        league_filter=league_id,
        week=week,
        activity_page=activity_page,
        team_id=team_id,
    )


def run_teams_analysis(
    *,
    api_base: str,
    jwt: str,
    team_id: str | None,
    league_id: str | None,
    week: int | None,
    put_lineup: str | None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """Fetch the teams analysis bundle via the local API.

    Args:
        api_base: Fantasy Builder API origin.
        jwt: Internal JWT.
        team_id: Optional team id.
        league_id: Optional league filter.
        week: Optional matchweek.
        put_lineup: Optional lineup JSON file for PUT.
        transport: Optional httpx transport (tests).

    Returns:
        Aggregated teams JSON.
    """
    api = FantasyClient(base_url=api_base, jwt=jwt, transport=transport)
    return fetch_teams_analysis(
        get_json=api.get_json,
        put_json=api.put_json,
        team_id=team_id,
        league_filter=league_id,
        week=week,
        put_lineup_body=load_put_lineup(put_lineup),
    )


def run_market_analysis(
    *,
    api_base: str,
    jwt: str,
    league_id: str | None,
    player_team_id: str | None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """Fetch the market analysis bundle via the local API (GET only).

    Args:
        api_base: Fantasy Builder API origin.
        jwt: Internal JWT.
        league_id: Optional league filter.
        player_team_id: Optional squad-entry id for offers.
        transport: Optional httpx transport (tests).

    Returns:
        Aggregated market JSON.
    """
    api = FantasyClient(base_url=api_base, jwt=jwt, transport=transport)
    return fetch_market_analysis(
        get_json=api.get_json,
        league_filter=league_id,
        player_team_id=player_team_id,
    )


def run_buyout_analysis(
    *,
    api_base: str,
    jwt: str,
    league_id: str,
    player_team_id: str,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    """Fetch shield status via the local API (GET only).

    Args:
        api_base: Fantasy Builder API origin.
        jwt: Internal JWT.
        league_id: Fantasy league identifier.
        player_team_id: Squad-entry id (``playerTeamId``).
        transport: Optional httpx transport (tests).

    Returns:
        Shield status JSON bundle.
    """
    api = FantasyClient(base_url=api_base, jwt=jwt, transport=transport)
    return fetch_buyout_analysis(
        get_json=api.get_json,
        league_id=league_id,
        player_team_id=player_team_id,
    )


def first_league_id(payload: Any) -> str | None:
    """Extract the first league id from a /leagues payload."""
    items: list[Any]
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict) and isinstance(payload.get("leagues"), list):
        items = payload["leagues"]
    else:
        return None
    for item in items:
        if not isinstance(item, dict):
            continue
        value = item.get("id") or item.get("leagueId") or item.get("league_id")
        if value is not None:
            return str(value)
    return None
