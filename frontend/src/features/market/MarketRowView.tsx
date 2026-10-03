import { m } from "motion/react";

import type { MarketActionsApi } from "./actions/useMarketActions";
import {
  MARKET_ROW_AT_REST,
  MARKET_ROW_EXIT_TRANSITION,
  MARKET_ROW_HOVER,
  MARKET_ROW_HOVER_TRANSITION,
  MARKET_ROW_TRANSITION,
} from "./MarketRowMotion";
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

type MarketRowViewProps = {
  row: MarketRow;
  now: number;
  actionContext: MarketActionContext;
  actions: MarketActionsApi;
  columnHeadings: Record<MarketColumnKey, MarketColumnHeading>;
};

export function MarketRowView({
  row,
  now,
  actionContext,
  actions,
  columnHeadings,
}: MarketRowViewProps) {
  return (
    <m.li
      className="market-row market-row-data"
      initial={{ opacity: 0, y: 10, scale: 1 }}
      animate={MARKET_ROW_AT_REST}
      exit={{ opacity: 0, y: -6, scale: 0.985, transition: MARKET_ROW_EXIT_TRANSITION }}
      whileHover={{ ...MARKET_ROW_HOVER, transition: MARKET_ROW_HOVER_TRANSITION }}
      transition={MARKET_ROW_TRANSITION}
    >
      <PlayerCell
        row={row}
        now={now}
        columnLabel={columnHeadings.player.label}
      />
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
      <span className="market-cell market-cell-seller" data-label={columnHeadings.sellOptions.label}>
        <SellerCell row={row} actionContext={actionContext} actions={actions} />
      </span>
    </m.li>
  );
}
