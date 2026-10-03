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

const BASE_LABELS: Record<MarketColumnKey, string> = {
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

function textFiltersPlayer(field: MarketFilters["field"], hasText: boolean): boolean {
  if (!hasText) return false;
  return field === "player" || field === "team" || field === "all";
}

function textFiltersSellOptions(field: MarketFilters["field"], hasText: boolean): boolean {
  if (!hasText) return false;
  return field === "seller" || field === "all";
}

/** Table header labels reflecting active market filters (desktop head + mobile data-label). */
export function marketColumnHeadings(filters: MarketFilters): Record<MarketColumnKey, MarketColumnHeading> {
  const hasText = normalizeSearchText(filters.text).length > 0;
  const playerFiltered = textFiltersPlayer(filters.field, hasText);
  const sellFiltered = textFiltersSellOptions(filters.field, hasText);
  const fsypSuffix = rangeSuffix(filters.points);
  const formSuffix = rangeSuffix(filters.form);
  const valueSuffix = rangeSuffix(filters.marketValue);
  const availabilityFiltered = filters.availability.size > 0;
  const availabilitySuffix = availabilityFiltered ? ` (${filters.availability.size})` : "";

  return {
    player: {
      label: playerFiltered ? `${BASE_LABELS.player} · filtered` : BASE_LABELS.player,
      filtered: playerFiltered,
    },
    position: { label: BASE_LABELS.position, filtered: false },
    fsyp: {
      label: `${BASE_LABELS.fsyp}${fsypSuffix}`,
      filtered: fsypSuffix.length > 0,
    },
    form: {
      label: `${BASE_LABELS.form}${formSuffix}`,
      filtered: formSuffix.length > 0,
    },
    marketValue: {
      label: `${BASE_LABELS.marketValue}${valueSuffix}`,
      filtered: valueSuffix.length > 0,
    },
    availability: {
      label: `${BASE_LABELS.availability}${availabilitySuffix}`,
      filtered: availabilityFiltered,
    },
    sealEnd: { label: BASE_LABELS.sealEnd, filtered: false },
    sellOptions: {
      label: sellFiltered ? `${BASE_LABELS.sellOptions} · seller` : BASE_LABELS.sellOptions,
      filtered: sellFiltered,
    },
  };
}
