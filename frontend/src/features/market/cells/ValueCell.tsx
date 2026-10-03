import type { ReactElement } from "react";

import { formatEuro, formatPercent, formatSignedEuro } from "../../../api/format";
import {
  formatMarketValueStat,
  formatMarketValueWithChange,
  marketValueSnapshot,
} from "../marketValueStats";
import type { ValuePoint } from "../model/valueSeries";

function variationPercentTone(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "is-flat";
  if (value > 1) return "is-up";
  if (value >= 0) return "is-mid";
  return "is-down";
}

export function ValueCell({
  marketValue,
  variation,
  variationPercent,
  valueHistory,
}: {
  marketValue: number | null;
  variation: number | null;
  variationPercent: number | null;
  valueHistory: readonly ValuePoint[];
}): ReactElement {
  const absolute = formatSignedEuro(variation);
  const percent = formatPercent(variationPercent);
  const tone = variationPercentTone(variationPercent);
  const stats = marketValueSnapshot(valueHistory, marketValue);

  const primary = (
    <>
      <span className="market-value-primary">{formatEuro(marketValue)}</span>
      {absolute || percent ? (
        <>
          <span className="market-value-sep"> · </span>
          <span className={`market-value-change ${tone}`}>
            {absolute}
            {percent ? ` (${percent})` : null}
          </span>
        </>
      ) : null}
    </>
  );

  return (
    <span
      className="market-value-line has-hover-tooltip-panel market-value-tooltip-target"
      tabIndex={0}
    >
      {primary}
      <span className="hover-tooltip-panel is-align-start market-value-tooltip" role="tooltip">
        <span className="market-value-tooltip-line">
          Last market value: {formatMarketValueStat(stats.last)}
        </span>
        <span className="market-value-tooltip-line">
          Highest market value: {formatMarketValueWithChange(stats.best, stats.last)}
        </span>
        <span className="market-value-tooltip-line">
          Lowest market value: {formatMarketValueWithChange(stats.lowest, stats.last)}
        </span>
        <span className="market-value-tooltip-line">
          Last 5 days market value: {formatMarketValueWithChange(stats.fiveDaysAgo, stats.last)}
        </span>
        <span className="market-value-tooltip-line">
          Last 14 days market value:{" "}
          {formatMarketValueWithChange(stats.fourteenDaysAgo, stats.last)}
        </span>
      </span>
    </span>
  );
}
