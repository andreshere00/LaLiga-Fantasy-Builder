import { formatIntegerAmount } from "../../api/format";
import { normalizeSearchText } from "../../searchText";
import type { NumericRange } from "../market/marketFilters";
import type { PlayersFilters } from "./playersSearchParams";

export type PlayersColumnKey =
  | "name"
  | "team"
  | "fsyp"
  | "form"
  | "marketValue"
  | "owner"
  | "availability"
  | "position";

export type PlayersColumnHeading = {
  label: string;
  filtered: boolean;
};

export const PLAYERS_COLUMN_BASE_LABELS: Record<PlayersColumnKey, string> = {
  name: "Name",
  team: "Team",
  fsyp: "FSYP",
  form: "Form",
  marketValue: "Value",
  owner: "Owned by",
  availability: "Avail.",
  position: "Pos.",
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

/** Table header labels reflecting active players list filters. */
export function playersColumnHeadings(
  filters: PlayersFilters,
): Record<PlayersColumnKey, PlayersColumnHeading> {
  const nameFiltered = normalizeSearchText(filters.player).length > 0;
  const teamFiltered = normalizeSearchText(filters.team).length > 0;
  const ownerFiltered = normalizeSearchText(filters.owner).length > 0;
  const fsypSuffix = rangeSuffix(filters.points);
  const formSuffix = rangeSuffix(filters.form);
  const valueSuffix = rangeSuffix(filters.marketValue);
  const availabilityFiltered = filters.availability.size > 0;
  const availabilitySuffix = availabilityFiltered ? ` (${filters.availability.size})` : "";
  const positionFiltered = filters.positions.size > 0;
  const positionSuffix = positionFiltered ? ` (${filters.positions.size})` : "";

  return {
    name: {
      label: nameFiltered ? `${PLAYERS_COLUMN_BASE_LABELS.name} · filtered` : PLAYERS_COLUMN_BASE_LABELS.name,
      filtered: nameFiltered,
    },
    team: {
      label: teamFiltered ? `${PLAYERS_COLUMN_BASE_LABELS.team} · filtered` : PLAYERS_COLUMN_BASE_LABELS.team,
      filtered: teamFiltered,
    },
    fsyp: {
      label: `${PLAYERS_COLUMN_BASE_LABELS.fsyp}${fsypSuffix}`,
      filtered: fsypSuffix.length > 0,
    },
    form: {
      label: `${PLAYERS_COLUMN_BASE_LABELS.form}${formSuffix}`,
      filtered: formSuffix.length > 0,
    },
    marketValue: {
      label: `${PLAYERS_COLUMN_BASE_LABELS.marketValue}${valueSuffix}`,
      filtered: valueSuffix.length > 0,
    },
    owner: {
      label: ownerFiltered ? `${PLAYERS_COLUMN_BASE_LABELS.owner} · filtered` : PLAYERS_COLUMN_BASE_LABELS.owner,
      filtered: ownerFiltered,
    },
    availability: {
      label: `${PLAYERS_COLUMN_BASE_LABELS.availability}${availabilitySuffix}`,
      filtered: availabilityFiltered,
    },
    position: {
      label: `${PLAYERS_COLUMN_BASE_LABELS.position}${positionSuffix}`,
      filtered: positionFiltered,
    },
  };
}

export function playersColumnBaseLabel(column: PlayersColumnKey): string {
  return PLAYERS_COLUMN_BASE_LABELS[column];
}
