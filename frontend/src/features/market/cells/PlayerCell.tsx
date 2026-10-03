import bidIconUrl from "../../../assets/button_bid.svg";
import { PlayerTile } from "../../lineup/PlayerTile";
import { bidAmountTooltipLabel } from "../bidTooltip";
import type { MarketRow } from "../model/row";

type PlayerCellProps = {
  row: MarketRow;
};

export function PlayerCell({ row }: PlayerCellProps) {
  const bidded = row.myBid != null;
  const bidMoney = row.myBid?.money;
  return (
    <>
      <div className="market-card">
        <PlayerTile
          name={row.name}
          captain={false}
          variant="squad"
          photoLayout="centered"
          photoUrl={row.photoUrl}
          teamBadgeUrl={row.teamBadgeUrl}
        />
      </div>
      <span className="market-name-wrap" data-label="Player">
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
          <span className={bidded ? "market-name is-bidded" : "market-name"}>{row.name}</span>
          {bidded && bidMoney != null ? (
            <span className="hover-tooltip-panel is-align-start" role="tooltip">
              {bidAmountTooltipLabel(bidMoney)}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );
}
