import { useId } from "react";

import bidIconUrl from "../../../assets/button_bid.svg";
import shieldRedIconUrl from "../../../assets/button_shield_red.svg";
import { PlayerTile } from "../../lineup/PlayerTile";
import { bidAmountTooltipLabel } from "../bidTooltip";
import { clauseUnlockTooltip } from "../marketMessages";
import type { MarketRow } from "../model/row";
import { clauseUnlockCountdown } from "../model/valueSeries";

type PlayerCellProps = {
  row: MarketRow;
  now: number;
  columnLabel?: string;
};

export function PlayerCell({ row, now, columnLabel = "Player" }: PlayerCellProps) {
  const clauseTooltipId = useId();
  const clauseCountdown =
    row.sellerKind === "opponent" ? clauseUnlockCountdown(row.clauseUnlockAt, now) : null;
  const clauseTooltip =
    clauseCountdown != null ? clauseUnlockTooltip(clauseCountdown) : null;
  const bidded = row.myBid != null;
  const bidMoney = row.myBid?.money;
  return (
    <>
      <div className="market-card">
        <PlayerTile
          name={row.name}
          captain={false}
          variant="squad"
          showName={false}
          photoUrl={row.photoUrl}
          teamBadgeUrl={row.teamBadgeUrl}
        />
      </div>
      <span className="market-name-wrap" data-label={columnLabel}>
        <span
          className={
            bidded
              ? "market-name-line has-hover-tooltip-panel is-bid-tooltip-target"
              : "market-name-line"
          }
          tabIndex={bidded ? 0 : undefined}
        >
          {bidded ? (
            <img className="market-bid-icon" src={bidIconUrl} alt="" aria-hidden />
          ) : null}
          <span
            className={
              ["market-name", bidded && "is-bidded", clauseCountdown && "is-clause-locked"]
                .filter(Boolean)
                .join(" ")
            }
          >
            {row.name}
          </span>
          {bidded && bidMoney != null ? (
            <span className="hover-tooltip-panel is-align-start" role="tooltip">
              {bidAmountTooltipLabel(bidMoney)}
            </span>
          ) : null}
        </span>
        {clauseTooltip ? (
          <span
            className="market-clause-flag has-hover-tooltip-panel"
            tabIndex={0}
            aria-label={clauseTooltip}
            aria-describedby={clauseTooltipId}
          >
            <img className="market-clause-flag-icon" src={shieldRedIconUrl} alt="" aria-hidden />
            <span
              id={clauseTooltipId}
              className="hover-tooltip-panel is-align-start"
              role="tooltip"
            >
              {clauseTooltip}
            </span>
          </span>
        ) : null}
      </span>
    </>
  );
}
