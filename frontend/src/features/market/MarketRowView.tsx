import { t, useTranslation } from "../../i18n";
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
  useTranslation();
  const imminent = isSealEndUnderOneMinute(expiresAt, now);
  const urgent = !imminent && isSealEndUnderOneHour(expiresAt, now);
  const label = remainingLabel(expiresAt, now);
  const className = imminent
    ? "market-seal-end is-expiring"
    : urgent
      ? "market-seal-end is-urgent"
      : "market-seal-end";
  const time = <span aria-hidden={imminent || undefined}>{t(label)}</span>;
  if (!imminent) return <span className={className}>{time}</span>;
  return (
    <Help
      content={t("This listing expires in less than one minute.")}
      trigger={
        <span className={className} tabIndex={0} aria-label={t("Less than 1 minute remaining")} />
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
  useTranslation();
  return (
    <>
      <PlayerCell row={row} now={now} columnLabel={columnHeadings.player.label} />
      <span className="market-cell" data-label={columnHeadings.position.label}>
        <PositionCell positionId={row.positionId} />
      </span>
      <span className="market-cell market-fsyp-cell" data-label={columnHeadings.fsyp.label}>
        <FsypCell
          labelAverage
          points={row.points}
          averagePoints={row.averagePoints}
          formRecent={row.formRecent}
        />
      </span>
      <span className="market-cell market-form" data-label={columnHeadings.form.label}>
        <FormCell row={row} windowSize={5} />
      </span>
      <span className="market-cell market-value" data-label={columnHeadings.marketValue.label}>
        <ValueCell
          marketValue={row.marketValue}
          variation={row.variation}
          variationPercent={row.variationPercent}
          valueHistory={row.valueHistory}
        />
        {row.myBid ? <span className="market-bid-value">
          {t("Your bid: ")}{formatEuro(row.myBid.money)}
        </span> : null}
        {row.sellerKind !== "laliga" ? <ReleaseClauseDetail row={row} now={now} /> : null}
      </span>
      <span
        className="market-cell market-cell-availability"
        data-label={columnHeadings.availability.label}
      >
        <AvailabilityCell availability={row.availability} />
      </span>
      <span className="market-cell" data-label={columnHeadings.sealEnd.label}>
        <SealEnd expiresAt={row.expiresAt} now={now} />
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
