import { Link } from "react-router-dom";

import { MarketActionMenu } from "../actions/MarketActionMenu";
import type { useMarketActions } from "../actions/useMarketActions";
import type { MarketActionContext } from "../actions/marketActions";
import { LALIGA_SELLER } from "../model/listing";
import type { MarketRow } from "../model/row";

type MarketActionsApi = ReturnType<typeof useMarketActions>;

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

export function SellerCell({ row, actionContext, actions }: SellerCellProps) {
  return (
    <span className="market-seller-wrap">
      <MarketActionMenu row={row} context={actionContext} actions={actions} />
      <SellerName seller={row.seller} sellerTeamId={row.sellerTeamId} />
    </span>
  );
}
