import { createContext, useContext } from "react";

/** Lets a position badge filter the list it is in: Market and Players provide it, other screens do not. */
export type PositionFilter = {
  /** Positions currently filtered on; empty when every position is shown. */
  selected: ReadonlySet<number>;
  onFilter: (positions: ReadonlySet<number>) => void;
};

export const PositionFilterContext = createContext<PositionFilter | null>(null);

export function usePositionFilter(): PositionFilter | null {
  return useContext(PositionFilterContext);
}

/** Clicking a badge shows only that position; clicking it again when it is the sole filter shows all. */
export function nextPositionFilter(selected: ReadonlySet<number>, positionId: number): ReadonlySet<number> {
  return selected.size === 1 && selected.has(positionId) ? new Set() : new Set([positionId]);
}
