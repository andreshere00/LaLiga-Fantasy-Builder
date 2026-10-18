import { Help } from "../../../components/ui/Help";
import { Link } from "react-router-dom";
import { formatEuro } from "../../../api/format";

import shieldIconUrl from "../../../assets/button_shield.svg";
import { MarketActionMenu } from "../actions/MarketActionMenu";
import type { MarketActionsApi } from "../actions/useMarketActions";
import type { MarketActionContext } from "../actions/marketActions";
import { clauseUnlockTooltip } from "../marketMessages";
import { LALIGA_SELLER } from "../model/listing";
import type { MarketRow } from "../model/row";
import { clauseUnlockCountdown, remainingLabel } from "../model/valueSeries";
import { protectionDescription } from "../model/protection";

type SellerCellProps = {
  row: MarketRow;
  actionContext: MarketActionContext;
  actions: MarketActionsApi;
};

function SellerName({ seller, sellerTeamId }: { seller: string; sellerTeamId: string | null }) {
  if (seller === LALIGA_SELLER || !sellerTeamId) {
    return <span className="market-seller">{seller}</span>;
  }
  return (
    <Link
      className="market-seller market-seller-link"
      to={`/?team=${encodeURIComponent(sellerTeamId)}`}
    >
      {seller}
    </Link>
  );
}

function ClauseUnlockTimer({ row, now }: { row: MarketRow; now: number }) {
  if (row.sellerKind === "laliga") return null;
  const full = clauseUnlockCountdown(row.clauseUnlockAt, now);
  if (full == null) return null;
  const tooltip = clauseUnlockTooltip(full);
  return (
    <Help content={tooltip} className="market-clause-timer">
      <span aria-hidden="true">{remainingLabel(row.clauseUnlockAt, now)}</span>
    </Help>
  );
}

export function SellerCell({ row, actionContext, actions }: SellerCellProps) {
  const protection = protectionDescription(row, actionContext.now);
  return (
    <span className="market-seller-wrap">
      <MarketActionMenu row={row} context={actionContext} actions={actions} />
      <SellerName seller={row.seller} sellerTeamId={row.sellerTeamId} />
      <span className="market-bid-count">Bids: {row.numberOfBids ?? "Unavailable"}</span>
      <span className="market-clause-detail">
        {protection ? <Help content={protection}>
          <img className="market-seller-shield" src={shieldIconUrl} alt={protection} />
        </Help> : null}
        <span>Release clause: {row.buyoutClause != null && row.buyoutClause > 0
          ? formatEuro(row.buyoutClause) : row.sellerKind === "laliga"
            ? "Not applicable" : "Unavailable"}</span>
      </span>
      <ClauseUnlockTimer row={row} now={actionContext.now} />
    </span>
  );
}
