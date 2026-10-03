import { formatIntegerAmount } from "../../api/format";
import { normalizeSearchText } from "../../searchText";
import type { MarketFilters, NumericRange } from "./marketFilters";

export type MarketColumnKey =
  | "player"
  | "position"
  | "fsyp"
  | "form"
  | "marketValue"
  | "availability"
  | "sealEnd"
  | "sellOptions";

export type MarketColumnHeading = {
  label: string;
  filtered: boolean;
};

export const MARKET_COLUMN_BASE_LABELS: Record<MarketColumnKey, string> = {
  player: "Player",
  position: "Position",
  fsyp: "FSYP",
  form: "Form",
  marketValue: "Market value",
  availability: "Availability",
  sealEnd: "Seal end",
  sellOptions: "Sell options",
};

function rangeIsActive(range: NumericRange): boolean {
  return range.min != null || range.max != null;
}

function rangeSuffix(range: NumericRange): string {
  if (!rangeIsActive(range)) return "";
  if (range.min != null && range.max != null) {
    return ` (${formatIntegerAmount(range.min)}–${formatIntegerAmount(range.max)})`;
  }
  if (range.min != null) return ` (≥ ${formatIntegerAmount(range.min)})`;
  if (range.max != null) return ` (≤ ${formatIntegerAmount(range.max)})`;
  return "";
}

/** Table header labels reflecting active market filters (desktop head + mobile data-label). */
export function marketColumnHeadings(
  filters: MarketFilters,
): Record<MarketColumnKey, MarketColumnHeading> {
  const playerFiltered = normalizeSearchText(filters.player).length > 0;
  const sellFiltered = normalizeSearchText(filters.seller).length > 0;
  const fsypSuffix = rangeSuffix(filters.points);
  const formSuffix = rangeSuffix(filters.form);
  const valueSuffix = rangeSuffix(filters.marketValue);
  const availabilityFiltered = filters.availability.size > 0;
  const availabilitySuffix = availabilityFiltered ? ` (${filters.availability.size})` : "";
  const positionFiltered = filters.positions.size > 0;
  const positionSuffix = positionFiltered ? ` (${filters.positions.size})` : "";

  return {
    player: {
      label: playerFiltered
        ? `${MARKET_COLUMN_BASE_LABELS.player} · filtered`
        : MARKET_COLUMN_BASE_LABELS.player,
      filtered: playerFiltered,
    },
    position: {
      label: `${MARKET_COLUMN_BASE_LABELS.position}${positionSuffix}`,
      filtered: positionFiltered,
    },
    fsyp: {
      label: `${MARKET_COLUMN_BASE_LABELS.fsyp}${fsypSuffix}`,
      filtered: fsypSuffix.length > 0,
    },
    form: {
      label: `${MARKET_COLUMN_BASE_LABELS.form}${formSuffix}`,
      filtered: formSuffix.length > 0,
    },
    marketValue: {
      label: `${MARKET_COLUMN_BASE_LABELS.marketValue}${valueSuffix}`,
      filtered: valueSuffix.length > 0,
    },
    availability: {
      label: `${MARKET_COLUMN_BASE_LABELS.availability}${availabilitySuffix}`,
      filtered: availabilityFiltered,
    },
    sealEnd: { label: MARKET_COLUMN_BASE_LABELS.sealEnd, filtered: false },
    sellOptions: {
      label: sellFiltered
        ? `${MARKET_COLUMN_BASE_LABELS.sellOptions} · seller`
        : MARKET_COLUMN_BASE_LABELS.sellOptions,
      filtered: sellFiltered,
    },
  };
}

export function marketColumnBaseLabel(column: MarketColumnKey): string {
  return MARKET_COLUMN_BASE_LABELS[column];
}
