"""Shared contract validation and identity helpers for lineup snapshots."""

from decimal import Decimal

from pydantic import BaseModel

from fantasy_api.domain.errors import UpstreamError
from fantasy_api.schemas.leagues import PlayerMaster
from fantasy_api.schemas.lineup_builder import ScoredPlayer
from fantasy_api.schemas.payload import as_object, as_object_list
from fantasy_api.services.payload import parse_payload


def _model[T: BaseModel](raw: object, model: type[T]) -> T:
    """Validate provider objects without coercing an unexpected payload to success."""
    data = parse_payload(as_object, raw)
    known = set(model.model_fields) | {f.alias for f in model.model_fields.values() if f.alias}
    if not known.intersection(data):
        raise UpstreamError("provider payload had no recognized fields", category="fantasy_error")
    return parse_payload(model.model_validate, data)


def _models[T: BaseModel](raw: object, model: type[T]) -> list[T]:
    """Validate each row after the shared collection envelope parser."""
    return [_model(row, model) for row in parse_payload(as_object_list, raw)]


def _identity(master: PlayerMaster, source: str, slot: str | None = None) -> ScoredPlayer:
    """Reject incomplete identity/value before computing any financial projection."""
    if (
        not master.id
        or master.market_value is None
        or master.team_id is None
        or master.position_id not in {1, 2, 3, 4}
    ):
        raise ValueError("player identity or valuation unavailable")
    return ScoredPlayer(
        player_id=master.id,
        name=master.nickname or master.name or master.id,
        club_id=master.team_id,
        position=master.position_id,
        source=source,
        player_team_id=slot,
        market_value=master.market_value,
        lineup_score=Decimal(0),
        trading_score=Decimal(0),
        combined_score=Decimal(0),
    )
