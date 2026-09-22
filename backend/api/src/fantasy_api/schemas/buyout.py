"""Buyout clause and shielding schemas for OpenAPI / Swagger."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from fantasy_api.schemas.common import FlexibleModel


class ShieldStatus(FlexibleModel):
    """Shield status from ``GET .../check-shield``."""


class BuyoutMutationResult(FlexibleModel):
    """Response from buyout write endpoints (may be empty)."""


class PayBuyoutWrite(BaseModel):
    """Request body for paying a buyout clause."""

    model_config = ConfigDict(extra="forbid")

    buyoutClauseToPay: int = Field(gt=0)


class IncreaseBuyoutWrite(BaseModel):
    """Request body for setting or increasing a buyout clause."""

    model_config = ConfigDict(extra="forbid")

    buyoutClause: int = Field(gt=0)


class ShieldWrite(BaseModel):
    """Request body for ``PUT .../shield/player``.

    ``playerId`` is the squad-entry id (``playerTeamId``), not the master
    footballer id. Observed clients use ``rewardedAdType`` ``Blindaje`` and
    ``rewardedAd`` ``1``.
    """

    model_config = ConfigDict(extra="forbid")

    playerId: str | int
    rewardedAdType: str
    rewardedAd: int
