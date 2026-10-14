import { Help } from "../../../components/ui/Help";
import { Link } from "react-router-dom";

import bidIconUrl from "../../../assets/button_bid.svg";
import shieldRedIconUrl from "../../../assets/button_shield_red.svg";
import { PlayerTile } from "../../lineup/PlayerTile";
import { bidAmountTooltipLabel } from "../bidTooltip";
import { clauseUnlockTooltip } from "../marketMessages";
import type { MarketRow } from "../model/row";
import { clauseUnlockCountdown } from "../model/valueSeries";
import { PlayerDetailsLink } from "../../players/PlayerDetailsLink";

type PlayerCellProps = {
  row: MarketRow;
  now: number;
  columnLabel?: string;
};

export function PlayerCell({ row, now, columnLabel = "Player" }: PlayerCellProps) {
  const clauseCountdown =
    row.sellerKind !== "laliga" ? clauseUnlockCountdown(row.clauseUnlockAt, now) : null;
  const clauseTooltip =
    clauseCountdown != null ? clauseUnlockTooltip(clauseCountdown) : null;
  const bidded = row.myBid != null;
  const bidMoney = row.myBid?.money;
  return (
    <>
      <div className="market-card">
        {row.playerId && row.positionId !== 5 ? (
          <PlayerDetailsLink
            playerId={row.playerId}
            playerName={row.name}
            className="market-player-details-link"
            card
            returnTo="/market"
          />
        ) : null}
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
        <Help className="market-name-line" content={bidded && bidMoney != null ? bidAmountTooltipLabel(bidMoney) : null}>
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
            {row.playerId && row.positionId !== 5 ? <Link className="players-name-link" to={"/players/" + encodeURIComponent(row.playerId)} state={{ returnTo: "/market" }}>{row.name}</Link> : row.name}
          </span>
        </Help>
        {clauseTooltip ? (
          <Help content={clauseTooltip} className="market-clause-flag">
            <img className="market-clause-flag-icon" src={shieldRedIconUrl} alt="" aria-hidden />
          </Help>
        ) : null}
      </span>
    </>
  );
}
