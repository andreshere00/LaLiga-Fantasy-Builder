import type { SquadCard } from "../../api/mappers";
import type { BuilderCandidate } from "../../api/schemas";
import { roleFromPositionId, type LineupDraft } from "./lineupDraft";

/** Remap every master identity to its current caller squad-entry id. */
export function builderDraft(candidate: BuilderCandidate, squad: readonly SquadCard[], supported: readonly string[]): LineupDraft | null {
  if (!supported.includes(candidate.formation) || candidate.starters.length !== 11
    || new Set(candidate.starters.map((p) => p.playerId)).size !== 11) return null;
  const tactical = candidate.formation.split(",").map(Number) as [number, number, number];
  const draft: LineupDraft = { tactical, goalkeeper: [], defender: [], midfield: [], striker: [] };
  for (const player of candidate.starters) {
    const owned = squad.filter((p) => p.masterPlayerId === player.playerId);
    const role = roleFromPositionId(player.position);
    if (owned.length !== 1 || !role || owned[0].positionId !== player.position || !owned[0].id) return null;
    draft[role].push(owned[0].id);
  }
  return draft.goalkeeper.length === 1 && draft.defender.length === tactical[0]
    && draft.midfield.length === tactical[1] && draft.striker.length === tactical[2] ? draft : null;
}
