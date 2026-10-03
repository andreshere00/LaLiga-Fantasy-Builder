import bidIconUrl from "../../../assets/button_bid.svg";
import { PlayerTile } from "../../lineup/PlayerTile";
import type { MarketRow } from "../model/row";

type PlayerCellProps = {
  row: MarketRow;
};

export function PlayerCell({ row }: PlayerCellProps) {
  const bidded = row.myBid != null;
  return (
    <>
      <div className="market-card">
        <PlayerTile
          name={row.name}
          captain={false}
          variant="squad"
          photoUrl={row.photoUrl}
          teamBadgeUrl={row.teamBadgeUrl}
        />
      </div>
      <span className="market-name-wrap" data-label="Player">
        <span className="market-name-line">
          {bidded ? (
            <img className="market-bid-icon" src={bidIconUrl} alt="" aria-hidden />
          ) : null}
          <span className={bidded ? "market-name is-bidded" : "market-name"}>{row.name}</span>
        </span>
      </span>
    </>
  );
}
