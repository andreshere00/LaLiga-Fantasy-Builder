import type { ReactElement } from "react";
import { Help } from "../../../components/ui/Help";

import { formatEuro, formatPercent, formatSignedEuro } from "../../../api/format";
import {
  formatMarketValueStat,
  formatMarketValueWithChange,
  marketValueSnapshot,
} from "../marketValueStats";
import type { ValuePoint } from "../model/valueSeries";

const VALUE_RISE_GREEN_MIN_PERCENT = 5;

function variationPercentTone(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "is-flat";
  if (value >= VALUE_RISE_GREEN_MIN_PERCENT) return "is-up";
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

  const change =
    absolute || percent ? (
      <>
        {absolute}
        {percent ? ` (${percent})` : null}
      </>
    ) : (
      "—"
    );

  return (
    <Help className="market-value-line" content={<>
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

    </>}>
      <span className="market-value-primary">{formatEuro(marketValue)}</span>
      <span className={`market-value-change ${tone}`}>{change}</span>
    </Help>
  );
}
