import {
  asFiniteNumber,
  asRecord,
  idText,
  mediaFromPlayerMaster,
  teamNameFromPlayerMaster,
  text,
} from "../../../api/mappers";
import { availabilityOf, type Availability } from "../../market/model/availability";
import {
  formAverageLastThree,
  playerFormHistory,
} from "../../market/model/form";
import type { CalendarFormContext } from "../../market/model/row";
import { buyoutClauseUnlockAt } from "../../market/model/buyout";

export type PlayerRow = {
  playerId: string;
  name: string;
  teamName: string | null;
  positionId: number | null;
  photoUrl: string | null;
  photoFallbackUrl?: string | null;
  teamBadgeUrl: string | null;
  points: number | null;
  form: number | null;
  formRecent: readonly number[];
  formRecentWeeks: readonly number[];
  pendingFormWeek?: number;
  averagePoints: number | null;
  marketValue: number | null;
  availability: Availability;
  ownedBy: string;
  ownerTeamId: string | null;
  ownership: PlayerOwner | null;
};

function displayName(nickname: string | null, name: string | null): string {
  return nickname ?? name ?? "Player";
}

/** Builds one catalog row with ownership and optional calendar form. */
export function playerRowFromCatalog(
  master: Record<string, unknown>,
  playerId: string,
  ownedBy: string,
  ownerTeamId: string | null = null,
  calendarForm?: CalendarFormContext,
  ownership: PlayerOwner | null = null,
): PlayerRow {
  const media = mediaFromPlayerMaster(master);
  const teamName = teamNameFromPlayerMaster(master);
  const positionId = asFiniteNumber(master.positionId);
  const capped = playerFormHistory(playerId, master.lastStats, calendarForm);
  const form = formAverageLastThree(capped.recent);
  return {
    playerId,
    name: displayName(text(master.nickname), text(master.name)),
    teamName,
    positionId,
    ...media,
    points: asFiniteNumber(master.points),
    form,
    formRecent: capped.recent,
    formRecentWeeks: capped.weeks,
    pendingFormWeek: capped.pendingFormWeek,
    averagePoints: asFiniteNumber(master.averagePoints),
    marketValue: asFiniteNumber(master.marketValue),
    availability: availabilityOf(master.playerStatus),
    ownedBy,
    ownerTeamId,
    ownership,
  };
}

export type PlayerOwner = {
  name: string | null;
  teamId: string;
  playerTeamId: string | null;
  buyoutClause: number | null;
  isShielded: boolean | null;
  clauseUnlockAt: number | null;
};

export function ownerByMasterIdFromRosters(
  rosterPayloads: readonly unknown[],
): Map<string, PlayerOwner> {
  const map = new Map<string, PlayerOwner>();
  for (const payload of rosterPayloads) {
    const team = asRecord(payload);
    if (!team) continue;
    const managerRecord = asRecord(team.manager);
    const managerName = text(managerRecord?.managerName) ?? text(team.managerName);
    const teamId = idText(team.id) ?? idText(team.teamId);
    if (!teamId) continue;
    const players = team.players;
    if (!Array.isArray(players)) continue;
    // A fetched roster replaces the older team-list snapshot, including removals.
    for (const [masterId, owner] of map) {
      if (owner.teamId === teamId) map.delete(masterId);
    }
    for (const entry of players) {
      const record = asRecord(entry);
      const master = asRecord(record?.playerMaster);
      const masterId = idText(master?.id);
      if (!record || !masterId) continue;
      const playerTeam = asRecord(record.playerTeam) ?? record;
      map.set(masterId, {
        name: managerName,
        teamId,
        playerTeamId: idText(record.playerTeamId) ?? idText(playerTeam.playerTeamId) ?? idText(playerTeam.id),
        buyoutClause: asFiniteNumber(playerTeam.buyoutClause),
        isShielded: typeof playerTeam.isShielded === "boolean" ? playerTeam.isShielded : null,
        clauseUnlockAt: buyoutClauseUnlockAt(playerTeam) ?? buyoutClauseUnlockAt(record),
      });
    }
  }
  return map;
}

export function rosterPhotoByMasterId(rosterPayloads: readonly unknown[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const payload of rosterPayloads) {
    const team = asRecord(payload);
    if (!team || !Array.isArray(team.players)) continue;
    for (const entry of team.players) {
      const record = asRecord(entry);
      const master = asRecord(record?.playerMaster);
      const masterId = idText(master?.id);
      const photoUrl =
        mediaFromPlayerMaster(master).photoUrl ?? mediaFromPlayerMaster(record).photoUrl;
      if (masterId && photoUrl) map.set(masterId, photoUrl);
    }
  }
  return map;
}

export function teamIdsFromLeagueTeams(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const entry of data) {
    const id = idText(asRecord(entry)?.id);
    if (id) ids.push(id);
  }
  return ids;
}
