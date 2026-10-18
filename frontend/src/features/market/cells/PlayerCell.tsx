import { Help } from "../../../components/ui/Help";
import { Link } from "react-router-dom";

import bidIconUrl from "../../../assets/button_bid.svg";
import shieldRedIconUrl from "../../../assets/button_shield_red.svg";
import notificationRedIconUrl from "../../../assets/icon_notification_red.svg";
import { leagueId } from "../../../api/mappers";
import { useLeague } from "../../lineup/LeagueProvider";
import { useMarketOffersMenu } from "../offers/MarketOffersContext";
import { PlayerTile } from "../../lineup/PlayerTile";
import { bidAmountTooltipLabel } from "../bidTooltip";
import { protectionDescription } from "../model/protection";
import type { MarketRow } from "../model/row";
import { PlayerDetailsLink } from "../../players/PlayerDetailsLink";

type PlayerCellProps = {
  row: MarketRow;
  now: number;
  columnLabel?: string;
};

export function PlayerCell({ row, now, columnLabel = "Player" }: PlayerCellProps) {
  const offersMenu = useMarketOffersMenu();
  const { selected } = useLeague();
  const hasOffers = row.sellerKind === "self" && row.playerTeamId != null && selected != null
    && offersMenu?.pendingOffers?.leagueKey === leagueId(selected)
    && offersMenu.pendingOffers.playerTeamIds.includes(row.playerTeamId);
  const clauseTooltip = protectionDescription(row, now);
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
        {hasOffers ? <Help content="This player has offers."
          trigger={<button type="button" className="market-player-offers-flag"
            aria-label={`View offers for ${row.name}`}
            onClick={() => {
              if (row.playerTeamId) offersMenu?.openForPlayer(row.playerTeamId, row.name);
            }} />}>
          <img src={notificationRedIconUrl} alt="" aria-hidden="true" />
        </Help> : null}
        <Help className="market-name-line" content={bidded && bidMoney != null ? bidAmountTooltipLabel(bidMoney) : null}>
          {bidded ? (
            <img className="market-bid-icon" src={bidIconUrl} alt="" aria-hidden />
          ) : null}
          <span
            className={
              ["market-name", bidded && "is-bidded", clauseTooltip && "is-protected"]
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
