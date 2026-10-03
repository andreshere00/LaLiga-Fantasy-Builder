import { pointsLabel } from "../../api/mappers";
import type { useMarketActions } from "./actions/useMarketActions";
import type { MarketActionContext } from "./actions/marketActions";
import { AvailabilityCell } from "./cells/AvailabilityCell";
import { FormCell } from "./cells/FormCell";
import { PlayerCell } from "./cells/PlayerCell";
import { SellerCell } from "./cells/SellerCell";
import { ValueCell } from "./cells/ValueCell";
import type { MarketRow } from "./model/row";
import { positionAbbrev, positionTone } from "./positions";
import { remainingLabel } from "./model/valueSeries";

type MarketActionsApi = ReturnType<typeof useMarketActions>;

type MarketRowViewProps = {
  row: MarketRow;
  now: number;
  actionContext: MarketActionContext;
  actions: MarketActionsApi;
};

export function MarketRowView({ row, now, actionContext, actions }: MarketRowViewProps) {
  const tone = positionTone(row.positionId);
  return (
    <li className="market-row">
      <PlayerCell row={row} />
      <span className="market-cell" data-label="Position">
        <span className={`market-position-badge is-${tone}`}>
          {positionAbbrev(row.positionId)}
        </span>
      </span>
      <span className="market-cell" data-label="FSYP">
        {pointsLabel(row.points)}
      </span>
      <span className="market-cell market-form" data-label="Form">
        <FormCell row={row} />
      </span>
      <span className="market-cell market-value" data-label="Market value">
        <ValueCell
          marketValue={row.marketValue}
          variation={row.variation}
          variationPercent={row.variationPercent}
        />
      </span>
      <span className="market-cell" data-label="Availability">
        <AvailabilityCell availability={row.availability} />
      </span>
      <span className="market-cell" data-label="Average score">
        {row.averagePoints == null ? "—" : row.averagePoints.toFixed(2)}
      </span>
      <span className="market-cell" data-label="Seal end">
        {remainingLabel(row.expiresAt, now)}
      </span>
      <span className="market-cell market-cell-seller" data-label="Sell options">
        <SellerCell row={row} actionContext={actionContext} actions={actions} />
      </span>
    </li>
  );
}
