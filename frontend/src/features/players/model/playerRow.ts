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
  formFromCalendarWeeks,
  formPoints,
  formRecentPoints,
  formRecentSeries,
  formRecentWeekNumbers,
} from "../../market/model/form";
import type { CalendarFormContext } from "../../market/model/row";

export type PlayerRow = {
  playerId: string;
  name: string;
  teamName: string | null;
  positionId: number | null;
  photoUrl: string | null;
  teamBadgeUrl: string | null;
  points: number | null;
  form: number | null;
  formRecent: readonly number[];
  formRecentWeeks: readonly number[];
  averagePoints: number | null;
  marketValue: number | null;
  availability: Availability;
  ownedBy: string;
};

function displayName(nickname: string | null, name: string | null): string {
  return nickname ?? name ?? "Player";
}

/** Builds one catalog row with ownership and optional calendar form. */
export function playerRowFromCatalog(
  master: Record<string, unknown>,
  playerId: string,
  ownedBy: string,
  calendarForm?: CalendarFormContext,
): PlayerRow {
  const media = mediaFromPlayerMaster(master);
  const teamName = teamNameFromPlayerMaster(master);
  const positionId = asFiniteNumber(master.positionId);
  const playedThrough =
    calendarForm != null && calendarForm.playedThrough >= 1
      ? calendarForm.playedThrough
      : null;
  let form = formPoints(master.lastStats, playedThrough);
  let formRecent = formRecentPoints(master.lastStats, playedThrough);
  let formRecentWeeks = formRecentWeekNumbers(master.lastStats, playedThrough);
  if (form == null && calendarForm) {
    const fromCalendar = formFromCalendarWeeks(
      playerId,
      calendarForm.weekNumbers,
      calendarForm.statsByWeek,
    );
    form = fromCalendar.form;
    formRecent = fromCalendar.formRecent;
    formRecentWeeks = calendarForm.weekNumbers.slice(0, formRecent.length);
  }
  const capped = formRecentSeries(formRecent, formRecentWeeks);
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
    averagePoints: asFiniteNumber(master.averagePoints),
    marketValue: asFiniteNumber(master.marketValue),
    availability: availabilityOf(master.playerStatus),
    ownedBy,
  };
}

export function ownerByMasterIdFromRosters(rosterPayloads: readonly unknown[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const payload of rosterPayloads) {
    const team = asRecord(payload);
    if (!team) continue;
    const managerRecord = asRecord(team.manager);
    const managerName = text(managerRecord?.managerName) ?? text(team.managerName);
    if (!managerName) continue;
    const players = team.players;
    if (!Array.isArray(players)) continue;
    for (const entry of players) {
      const record = asRecord(entry);
      const master = asRecord(record?.playerMaster);
      const masterId = idText(master?.id);
      if (masterId) map.set(masterId, managerName);
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
      const photoUrl = mediaFromPlayerMaster(master).photoUrl;
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
