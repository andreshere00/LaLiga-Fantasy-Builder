import { copy as localizeCopy, useLanguage } from "../../i18n";
import type { MarketActionsApi } from "./actions/useMarketActions";
import { formatEuro } from "../../api/format";
import type { MarketActionContext } from "./actions/marketActions";
import { AvailabilityCell } from "./cells/AvailabilityCell";
import { FormCell } from "./cells/FormCell";
import { FsypCell } from "./cells/FsypCell";
import { PositionCell } from "./cells/PositionCell";
import { PlayerCell } from "./cells/PlayerCell";
import { ReleaseClauseDetail } from "./cells/ReleaseClauseDetail";
import { SellerCell } from "./cells/SellerCell";
import { ValueCell } from "./cells/ValueCell";
import type { MarketColumnHeading, MarketColumnKey } from "./marketColumnHeadings";
import warningIconUrl from "../../assets/button_warning.svg";
import { Help } from "../../components/ui/Help";
import type { MarketRow } from "./model/row";
import {
  isSealEndUnderOneHour,
  isSealEndUnderOneMinute,
  remainingLabel,
} from "./model/valueSeries";

/** Listing countdown. The final minute uses a warning icon instead of the coral rail. */
export function SealEnd({ expiresAt, now }: { expiresAt: number | null; now: number }) {
  useLanguage();
  const imminent = isSealEndUnderOneMinute(expiresAt, now);
  const urgent = !imminent && isSealEndUnderOneHour(expiresAt, now);
  const label = remainingLabel(expiresAt, now);
  const className = imminent
    ? "market-seal-end is-expiring"
    : urgent
      ? "market-seal-end is-urgent"
      : "market-seal-end";
  const time = <span aria-hidden={imminent || undefined}>{localizeCopy(label)}</span>;
  if (!imminent) return <span className={className}>{time}</span>;
  return (
    <Help
      content={localizeCopy("This listing expires in less than one minute.")}
      trigger={
        <span className={className} tabIndex={0} aria-label={localizeCopy("Less than 1 minute remaining")} />
      }
    >
      <img src={warningIconUrl} alt="" />
      {time}
    </Help>
  );
}

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
  useLanguage();
  return (
    <>
      <PlayerCell row={row} now={now} columnLabel={columnHeadings.player.label} />
      <span className="market-cell" data-label={localizeCopy(columnHeadings.position.label)}>
        <PositionCell positionId={row.positionId} />
      </span>
      <span className="market-cell market-fsyp-cell" data-label={localizeCopy(columnHeadings.fsyp.label)}>
        <FsypCell
          labelAverage
          points={row.points}
          averagePoints={row.averagePoints}
          formRecent={row.formRecent}
        />
      </span>
      <span className="market-cell market-form" data-label={localizeCopy(columnHeadings.form.label)}>
        <FormCell row={row} windowSize={5} />
      </span>
      <span className="market-cell market-value" data-label={localizeCopy(columnHeadings.marketValue.label)}>
        <ValueCell
          marketValue={row.marketValue}
          variation={row.variation}
          variationPercent={row.variationPercent}
          valueHistory={row.valueHistory}
        />
        {row.myBid ? <span className="market-bid-value">
          {localizeCopy("Your bid: ")}{localizeCopy(formatEuro(row.myBid.money))}
        </span> : null}
        {row.sellerKind !== "laliga" ? <ReleaseClauseDetail row={row} now={now} /> : null}
      </span>
      <span
        className="market-cell market-cell-availability"
        data-label={localizeCopy(columnHeadings.availability.label)}
      >
        <AvailabilityCell availability={row.availability} />
      </span>
      <span className="market-cell" data-label={localizeCopy(columnHeadings.sealEnd.label)}>
        <SealEnd expiresAt={row.expiresAt} now={now} />
      </span>
      <span
        className="market-cell market-cell-seller"
        data-label={localizeCopy(columnHeadings.sellOptions.label)}
      >
        <SellerCell row={row} actionContext={actionContext} actions={actions} />
      </span>
    </>
  );
}
