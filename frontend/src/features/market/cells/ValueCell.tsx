import type { ReactElement } from "react";

import { formatEuro, formatPercent, formatSignedEuro } from "../../../api/format";

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
}: {
  marketValue: number | null;
  variation: number | null;
  variationPercent: number | null;
}): ReactElement {
  const absolute = formatSignedEuro(variation);
  const percent = formatPercent(variationPercent);
  const tone = variationPercentTone(variationPercent);
  if (!absolute && !percent) {
    return <span className="market-value-primary">{formatEuro(marketValue)}</span>;
  }
  return (
    <span className="market-value-line">
      <span className="market-value-primary">{formatEuro(marketValue)}</span>
      <span className="market-value-sep"> · </span>
      <span className={`market-value-change ${tone}`}>
        {absolute}
        {percent ? ` (${percent})` : null}
      </span>
    </span>
  );
}
