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
    return <span className="market-seller">
      <span className="market-laliga-identity">
        <svg className="market-laliga-icon" viewBox="70 0 380 350"
          aria-hidden="true" width={24} height={24}>
          {/* Crop the existing logo to its symbol, above the embedded wordmark. */}
          <image href="/badges/football-logos/spain-la-liga.png" width={512} height={512} />
        </svg>
        {seller}
      </span>
    </span>;
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
      <span className="market-bid-count">Bids: {row.numberOfBids ?? 0}</span>
    </span>
  );
}
