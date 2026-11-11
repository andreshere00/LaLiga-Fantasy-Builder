import { t } from "../../i18n";
import { AVAILABILITY_FILTER_OPTIONS } from "../market/MarketFilterFields";
import { POSITION_FILTER_OPTIONS } from "../market/positions";
import {
  SQUAD_FORM_OPTIONS,
  type SquadFilterKey,
  type SquadFilters,
  type SquadNumericRange,
} from "./squadFilters";

/** `short` is an optional compact label, e.g. a position abbreviation for phones. */
export type FilterOption = { value: string; label: string; short?: string };

export const POSITION_OPTIONS: readonly FilterOption[] = POSITION_FILTER_OPTIONS.map((option) => ({
  value: String(option.id), label: option.label, short: option.abbrev,
}));
export const FORM_OPTIONS: readonly FilterOption[] = SQUAD_FORM_OPTIONS.map((form) => ({
  value: form, label: form,
}));

/** Group labels in the order the dialog shows them. */
export const SQUAD_FILTER_LABELS: Record<SquadFilterKey, string> = {
  positions: "Position",
  points: "FSYP",
  minStarterProbability: "Start probability",
  forms: "Form",
  availability: "Availability",
  clubs: "Club",
};

export type SquadFilterChip = { key: SquadFilterKey; label: string; value: string };

/** Translated "current value" text for one filter group; "Any" when it is off. */
export function squadFilterValue(filters: SquadFilters, key: SquadFilterKey): string {
  switch (key) {
    case "positions":
      return selectionSummary(POSITION_OPTIONS, new Set([...filters.positions].map(String)));
    case "points":
      return pointsSummary(filters.points);
    case "clubs":
      return selectionSummary(clubOptions(filters.clubs), filters.clubs, false);
    case "minStarterProbability":
      return filters.minStarterProbability > 0
        ? t("At least {{0}}%", { 0: filters.minStarterProbability }) : t("Any");
    case "forms":
      return selectionSummary(FORM_OPTIONS, filters.forms);
    case "availability":
      return selectionSummary(AVAILABILITY_FILTER_OPTIONS, filters.availability);
  }
}

/** Whether one filter group narrows the list, read from the selection and never from its text. */
export function squadFilterActive(filters: SquadFilters, key: SquadFilterKey): boolean {
  switch (key) {
    case "positions": return filters.positions.size > 0;
    case "points": return filters.points.min != null || filters.points.max != null;
    case "clubs": return filters.clubs.size > 0;
    case "minStarterProbability": return filters.minStarterProbability > 0;
    case "forms": return filters.forms.size > 0;
    case "availability": return filters.availability.size > 0;
  }
}

/** One chip per active group, in dialog order, for the applied-filters bar. */
export function activeSquadFilterChips(filters: SquadFilters): SquadFilterChip[] {
  return (Object.keys(SQUAD_FILTER_LABELS) as SquadFilterKey[])
    .filter((key) => squadFilterActive(filters, key))
    .map((key) => ({ key, label: t(SQUAD_FILTER_LABELS[key]), value: squadFilterValue(filters, key) }));
}

function clubOptions(clubs: ReadonlySet<string>): FilterOption[] {
  return [...clubs].sort((left, right) => left.localeCompare(right, "en"))
    .map((club) => ({ value: club, label: club }));
}

function selectionSummary(
  options: readonly FilterOption[], selected: ReadonlySet<string>, translateLabels = true,
): string {
  const labels = options.filter((option) => selected.has(option.value))
    .map((option) => translateLabels ? t(option.label) : option.label);
  if (labels.length === 0) return t("Any");
  return labels.length <= 2 ? labels.join(", ") : t("{{0}} filters selected", { 0: labels.length });
}

function pointsSummary(range: SquadNumericRange): string {
  if (range.min == null && range.max == null) return t("Any");
  if (range.min != null && range.max != null) return `${range.min}–${range.max} pts`;
  return range.min != null ? `${range.min}+ pts` : t("Up to {{0}} pts", { 0: range.max ?? 0 });
}
