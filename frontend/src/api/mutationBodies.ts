import type { SquadPlayerId } from "./ids";

/** Upstream JSON uses ``playerId`` for the squad-entry id on several mutations. */
export function upstreamPlayerIdBody(playerTeamId: SquadPlayerId): { playerId: string } {
  return { playerId: playerTeamId as string };
}
