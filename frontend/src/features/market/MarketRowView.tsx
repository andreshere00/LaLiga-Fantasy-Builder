import type { MarketActionsApi } from "./actions/useMarketActions";
import type { MarketActionContext } from "./actions/marketActions";
import { AvailabilityCell } from "./cells/AvailabilityCell";
import { FormCell } from "./cells/FormCell";
import { FsypCell } from "./cells/FsypCell";
import { PositionCell } from "./cells/PositionCell";
import { PlayerCell } from "./cells/PlayerCell";
import { SellerCell } from "./cells/SellerCell";
import { ValueCell } from "./cells/ValueCell";
import type { MarketColumnHeading, MarketColumnKey } from "./marketColumnHeadings";
import type { MarketRow } from "./model/row";
import { isSealEndUnderOneHour, remainingLabel } from "./model/valueSeries";

export type MarketRowCellsProps = {
  row: MarketRow;
  now: number;
  actionContext: MarketActionContext;
  actions: MarketActionsApi;
  columnHeadings: Record<MarketColumnKey, MarketColumnHeading>;
};

export function MarketRowCells({
  row,
  now,
  actionContext,
  actions,
  columnHeadings,
}: MarketRowCellsProps) {
  return (
    <>
      <PlayerCell row={row} now={now} columnLabel={columnHeadings.player.label} />
      <span className="market-cell" data-label={columnHeadings.position.label}>
        <PositionCell positionId={row.positionId} />
      </span>
      <span className="market-cell market-fsyp-cell" data-label={columnHeadings.fsyp.label}>
        <FsypCell
          points={row.points}
          averagePoints={row.averagePoints}
          formRecent={row.formRecent}
        />
      </span>
      <span className="market-cell market-form" data-label={columnHeadings.form.label}>
        <FormCell row={row} />
      </span>
      <span className="market-cell market-value" data-label={columnHeadings.marketValue.label}>
        <ValueCell
          marketValue={row.marketValue}
          variation={row.variation}
          variationPercent={row.variationPercent}
          valueHistory={row.valueHistory}
        />
      </span>
      <span
        className="market-cell market-cell-availability"
        data-label={columnHeadings.availability.label}
      >
        <AvailabilityCell availability={row.availability} />
      </span>
      <span className="market-cell" data-label={columnHeadings.sealEnd.label}>
        <span
          className={
            isSealEndUnderOneHour(row.expiresAt, now)
              ? "market-seal-end is-urgent"
              : "market-seal-end"
          }
        >
          {remainingLabel(row.expiresAt, now)}
        </span>
      </span>
      <span
        className="market-cell market-cell-seller"
        data-label={columnHeadings.sellOptions.label}
      >
        <SellerCell row={row} actionContext={actionContext} actions={actions} />
      </span>
    </>
  );
}
