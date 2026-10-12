"""Buyout clause and shielding schemas for OpenAPI / Swagger."""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from fantasy_api.schemas.common import FantasyWireModel, FantasyWriteModel


class ShieldStatus(FantasyWireModel):
    """Shield status from ``GET .../check-shield``."""

    is_shielded: bool | None = None


class BuyoutMutationResult(FantasyWireModel):
    """Response from buyout write endpoints (may be empty)."""

    empty_payload_allowed: ClassVar[bool] = True
    ok: bool | None = None
    message: str | None = None


class PayBuyoutWrite(FantasyWriteModel):
    """Request body for paying a buyout clause."""

    buyout_clause_to_pay: int = Field(strict=True, gt=0)


class IncreaseBuyoutWrite(FantasyWriteModel):
    """Request body for setting or increasing a buyout clause."""

    buyout_clause: int = Field(strict=True, gt=0)


class ShieldWrite(FantasyWriteModel):
    """Request body for ``PUT .../shield/player``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id. Observed clients use ``rewardedAdType`` ``Blindaje`` and
    ``rewardedAd`` ``1``.
    """

    player_id: str | int
    rewarded_ad_type: str
    rewarded_ad: int = Field(strict=True)
