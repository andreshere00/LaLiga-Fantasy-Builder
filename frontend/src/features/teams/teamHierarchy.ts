import { hierarchyPresentation, type HierarchyPresentation } from "../players/hierarchy";

export type HierarchyEntry = {
  playerId: string;
  name: string;
  positionId: number | null;
  points: number | null;
  /** Role as published by the player profile, null when the profile has none. */
  hierarchy: string | null;
  /** Position in the source ranking, 1 being the most important role. */
  rank: number | null;
};

export type HierarchyGroup = {
  /** English catalog key, also the stable identity of the level. */
  label: string;
  presentation: HierarchyPresentation;
  players: HierarchyEntry[];
};

/** Most to least important; levels the app does not know about follow, then players without one. */
const LEVEL_ORDER = [
  "God", "Key player", "Important", "Rotation", "Impact substitute", "Other", "Reserve",
  "Unknown", "Unavailable",
];

function levelIndex(label: string): number {
  const index = LEVEL_ORDER.indexOf(label);
  return index === -1 ? LEVEL_ORDER.length : index;
}

/** Players grouped by squad role, most important role first, best scorers first within a role. */
export function hierarchyGroups(entries: readonly HierarchyEntry[]): HierarchyGroup[] {
  const byLabel = new Map<string, HierarchyGroup>();
  for (const entry of entries) {
    const presentation = hierarchyPresentation(entry.hierarchy);
    const group = byLabel.get(presentation.label)
      ?? { label: presentation.label, presentation, players: [] };
    group.players.push(entry);
    byLabel.set(presentation.label, group);
  }
  for (const group of byLabel.values()) {
    group.players.sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name));
  }
  return [...byLabel.values()].sort((a, b) => levelIndex(a.label) - levelIndex(b.label));
}
