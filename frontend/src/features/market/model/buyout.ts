import { asFiniteNumber, asRecord, idText, parseInstant, playersOf } from "../../../api/mappers";
import { sellerTeamIdOf } from "./listing";

const LOCK_TIME_KEYS = [
  "buyoutClauseLockedEndTime",
  "buyout_clause_locked_end_time",
  "buyoutClauseLockEndTime",
] as const;

/** When the buyout clause becomes payable (end of the lock window). */
export function buyoutClauseUnlockAt(source: Record<string, unknown> | null): number | null {
  if (!source) return null;
  for (const key of LOCK_TIME_KEYS) {
    const time = parseInstant(source[key]);
    if (time != null) return time;
  }
  return null;
}

/** Unlock times keyed by squad-entry id from ``GET /leagues/.../teams/{id}`` rosters. */
export function buyoutUnlockByPlayerTeamId(
  teams: readonly unknown[],
): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const team of teams) {
    const roster = playersOf(team);
    if (!Array.isArray(roster)) continue;
    for (const entry of roster) {
      const record = asRecord(entry);
      const playerTeamId = idText(record?.playerTeamId) ?? idText(record?.id);
      const unlockAt = buyoutClauseUnlockAt(record);
      if (playerTeamId && unlockAt != null) map.set(playerTeamId, unlockAt);
    }
  }
  return map;
}

/** Seller teams whose market listings expose a buyout but may omit lock metadata. */
export function sellerTeamIdsForBuyoutLookup(
  items: readonly Record<string, unknown>[],
  callerTeamId: string | null,
): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    const playerTeam = asRecord(item.playerTeam);
    const clause = asFiniteNumber(playerTeam?.buyoutClause);
    if (clause == null || clause <= 0) continue;
    const sellerTeamId = sellerTeamIdOf(item);
    if (!sellerTeamId || sellerTeamId === callerTeamId) continue;
    ids.add(sellerTeamId);
  }
  return [...ids];
}
