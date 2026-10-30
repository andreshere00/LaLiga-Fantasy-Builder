import { Link } from "react-router-dom";

import { MarketActionMenu } from "../actions/MarketActionMenu";
import type { MarketActionsApi } from "../actions/useMarketActions";
import type { MarketActionContext } from "../actions/marketActions";
import { ManagerIdentity } from "../../shell/ManagerIdentity";
import type { MarketRow } from "../model/row";

type SellerCellProps = {
  row: MarketRow;
  actionContext: MarketActionContext;
  actions: MarketActionsApi;
};

function SellerName({ row }: { row: MarketRow }) {
  const { seller, sellerTeamId, sellerAvatarUrl } = row;
  if (row.sellerKind === "laliga") {
    return <span className="market-seller">{seller}</span>;
  }
  const identity = <ManagerIdentity name={seller} avatarUrl={sellerAvatarUrl} />;
  if (!sellerTeamId) return <span className="market-seller">{identity}</span>;
  return (
    <Link
      className="market-seller market-seller-link"
      to={`/?team=${encodeURIComponent(sellerTeamId)}`}
    >
      {identity}
    </Link>
  );
}

export function SellerCell({ row, actionContext, actions }: SellerCellProps) {
  return (
    <span className="market-seller-wrap">
      <MarketActionMenu row={row} context={actionContext} actions={actions} />
      <SellerName row={row} />
      <span className="market-bid-count">Bids: {row.numberOfBids ?? "Unavailable"}</span>
    </span>
  );
}
