import type { LineupGroup, LineupRole, LineupSlotView, SquadCard } from "../../api/mappers";
import { codeFromTactical, tacticalFromCode } from "./formations";

export type LineupDraft = {
  tactical: [number, number, number];
  goalkeeper: string[];
  defender: string[];
  midfield: string[];
  striker: string[];
};

export type PitchSelection = {
  role: LineupRole;
  playerId: string;
};

const ROLE_ORDER: readonly LineupRole[] = [
  "goalkeeper",
  "defender",
  "midfield",
  "striker",
];

const POSITION_BY_ROLE: Record<LineupRole, number> = {
  goalkeeper: 1,
  defender: 2,
  midfield: 3,
  striker: 4,
};

export function roleFromPositionId(positionId: number | null | undefined): LineupRole | null {
  if (positionId === 1) return "goalkeeper";
  if (positionId === 2) return "defender";
  if (positionId === 3) return "midfield";
  if (positionId === 4) return "striker";
  return null;
}

function slotsForRole(draft: LineupDraft, role: LineupRole): string[] {
  return draft[role];
}

function setSlotsForRole(draft: LineupDraft, role: LineupRole, ids: string[]): LineupDraft {
  return { ...draft, [role]: ids };
}

export function groupsFromDraft(
  draft: LineupDraft,
  squadById: ReadonlyMap<string, SquadCard>,
): LineupGroup[] {
  return ROLE_ORDER.map((role) => ({
    role,
    players: slotsForRole(draft, role).map((id) => slotViewFromId(id, role, squadById)),
  }));
}

function emptySlotId(role: LineupRole, index: number): string {
  return `empty-${role}-${index}`;
}

function isEmptySlotId(id: string): boolean {
  return id.startsWith("empty-");
}

function isFilledSlotId(id: string): boolean {
  return id.length > 0 && !isEmptySlotId(id);
}

function slotIdsForRole(
  groups: readonly LineupGroup[],
  role: LineupRole,
  count: number,
): string[] {
  const existing = groups.find((group) => group.role === role)?.players ?? [];
  const line: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const slot = existing[index];
    const id = slot?.id ?? "";
    if (slot?.isEmpty || !id || isEmptySlotId(id)) {
      line.push("");
      continue;
    }
    line.push(id);
  }
  return line;
}

function padDraftLine(line: readonly string[], count: number): string[] {
  const next = line.map((id) => (isFilledSlotId(id) ? id : "")).slice(0, count);
  while (next.length < count) next.push("");
  return next;
}

/** Pad each line to the tactical counts so a full XI can be validated. */
export function normalizeDraft(draft: LineupDraft): LineupDraft {
  const [defenders, midfielders, strikers] = draft.tactical;
  return {
    tactical: [...draft.tactical],
    goalkeeper: padDraftLine(draft.goalkeeper, 1),
    defender: padDraftLine(draft.defender, defenders),
    midfield: padDraftLine(draft.midfield, midfielders),
    striker: padDraftLine(draft.striker, strikers),
  };
}

export function draftFromGroups(
  groups: readonly LineupGroup[],
  tactical: readonly number[] | null,
): LineupDraft | null {
  const code = codeFromTactical(tactical);
  if (!code) return null;
  const [defenders, midfielders, strikers] = tacticalFromCode(code) as [
    number,
    number,
    number,
  ];
  return normalizeDraft({
    tactical: [defenders, midfielders, strikers],
    goalkeeper: slotIdsForRole(groups, "goalkeeper", 1),
    defender: slotIdsForRole(groups, "defender", defenders),
    midfield: slotIdsForRole(groups, "midfield", midfielders),
    striker: slotIdsForRole(groups, "striker", strikers),
  });
}

function emptySlotIndex(id: string): number | null {
  const suffix = id.split("-").pop();
  if (suffix == null) return null;
  const index = Number(suffix);
  return Number.isFinite(index) ? index : null;
}

function pitchSlotFromLineupAndSquad(
  slot: LineupSlotView,
  card: SquadCard | undefined,
): LineupSlotView {
  if (card) {
    return {
      id: slot.id,
      name: card.name ?? slot.name,
      photoUrl: card.photoUrl ?? slot.photoUrl ?? null,
      teamBadgeUrl: slot.teamBadgeUrl ?? card.teamBadgeUrl ?? null,
      fixturePoints: slot.fixturePoints ?? card.fixturePoints ?? null,
    };
  }
  if (!slot.name?.trim()) {
    return { id: slot.id, name: "", isEmpty: true };
  }
  return {
    id: slot.id,
    name: slot.name,
    photoUrl: slot.photoUrl ?? null,
    teamBadgeUrl: slot.teamBadgeUrl ?? null,
    fixturePoints: slot.fixturePoints ?? null,
  };
}

function slotViewFromId(
  id: string,
  role: LineupRole,
  squadById: ReadonlyMap<string, SquadCard>,
): LineupSlotView {
  if (!id || isEmptySlotId(id)) {
    return { id: id || emptySlotId(role, 0), name: "", isEmpty: true };
  }
  const card = squadById.get(id);
  const slot: LineupSlotView = { id, name: card?.name ?? "" };
  if (card) {
    return pitchSlotFromLineupAndSquad(slot, card);
  }
  return { id, name: "", isEmpty: true };
}

function roleSlotCount(role: LineupRole, tactical: readonly number[]): number {
  if (role === "goalkeeper") return 1;
  if (role === "defender") return tactical[0] ?? 0;
  if (role === "midfield") return tactical[1] ?? 0;
  return tactical[2] ?? 0;
}

/** Pad lineup groups to the tactical counts and mark missing slots empty. */
export function groupsForPitchDisplay(
  groups: readonly LineupGroup[],
  tactical: readonly number[] | null,
  squadById: ReadonlyMap<string, SquadCard>,
): LineupGroup[] {
  if (!tactical || tactical.length !== 3) return [...groups];
  return ROLE_ORDER.map((role) => {
    const required = roleSlotCount(role, tactical);
    const existing = groups.find((group) => group.role === role)?.players ?? [];
    const players: LineupSlotView[] = [];
    for (let index = 0; index < required; index += 1) {
      const slot = existing[index];
      if (slot?.isEmpty || !slot?.id || isEmptySlotId(slot.id)) {
        players.push({ id: emptySlotId(role, index), name: "", isEmpty: true });
        continue;
      }
      players.push(pitchSlotFromLineupAndSquad(slot, squadById.get(slot.id)));
    }
    return { role, players };
  });
}

export function allDraftPlayerIds(draft: LineupDraft): Set<string> {
  const ids = new Set<string>();
  for (const role of ROLE_ORDER) {
    for (const id of slotsForRole(draft, role)) ids.add(id);
  }
  return ids;
}

export function isDraftComplete(draft: LineupDraft): boolean {
  const [defenders, midfielders, strikers] = draft.tactical;
  const filledIds: string[] = [];
  for (const role of ROLE_ORDER) {
    for (const id of slotsForRole(draft, role)) {
      if (isFilledSlotId(id)) filledIds.push(id);
    }
  }
  if (new Set(filledIds).size !== filledIds.length) return false;
  return (
    draft.goalkeeper.length === 1 &&
    draft.defender.length === defenders &&
    draft.midfield.length === midfielders &&
    draft.striker.length === strikers &&
    draft.goalkeeper.every(isFilledSlotId) &&
    draft.defender.every(isFilledSlotId) &&
    draft.midfield.every(isFilledSlotId) &&
    draft.striker.every(isFilledSlotId)
  );
}

function draftWithoutPlayer(draft: LineupDraft, playerId: string): LineupDraft {
  let next = draft;
  for (const role of ROLE_ORDER) {
    const line = slotsForRole(next, role).map((id) => (id === playerId ? "" : id));
    next = setSlotsForRole(next, role, line);
  }
  return next;
}

/** Bench players eligible when replacing a lineup slot (role match, not in XI). */
export function squadPickerPool(
  squad: readonly SquadCard[],
  draft: LineupDraft,
  role: LineupRole,
  search: string,
): SquadCard[] {
  const linedUp = allDraftPlayerIds(draft);
  return squad.filter((player) => {
    if (roleFromPositionId(player.positionId) !== role) return false;
    if (linedUp.has(player.id)) return false;
    return squadMatchesSearch(player.name, search);
  });
}

function squadPoolForRole(
  squad: readonly SquadCard[],
  role: LineupRole,
  used: Set<string>,
): SquadCard[] {
  const positionId = POSITION_BY_ROLE[role];
  return squad.filter(
    (player) =>
      player.positionId === positionId && !used.has(player.id) && player.id.length > 0,
  );
}

function fillLine(
  kept: string[],
  count: number,
  squad: readonly SquadCard[],
  role: LineupRole,
  used: Set<string>,
): string[] {
  const next = kept.slice(0, count);
  for (const id of next) used.add(id);
  while (next.length < count) {
    const pool = squadPoolForRole(squad, role, used);
    const pick = pool[0];
    if (!pick) break;
    next.push(pick.id);
    used.add(pick.id);
  }
  return next;
}

export function applyFormationCode(
  draft: LineupDraft,
  squad: readonly SquadCard[],
  code: string,
): LineupDraft {
  const [defenders, midfielders, strikers] = tacticalFromCode(code) as [
    number,
    number,
    number,
  ];
  const used = new Set<string>();
  const goalkeeper = fillLine(draft.goalkeeper, 1, squad, "goalkeeper", used);
  for (const id of goalkeeper) used.add(id);
  const defender = fillLine(draft.defender, defenders, squad, "defender", used);
  for (const id of defender) used.add(id);
  const midfield = fillLine(draft.midfield, midfielders, squad, "midfield", used);
  for (const id of midfield) used.add(id);
  const striker = fillLine(draft.striker, strikers, squad, "striker", used);
  return normalizeDraft({
    tactical: [defenders, midfielders, strikers],
    goalkeeper,
    defender,
    midfield,
    striker,
  });
}

export function applyPitchPick(
  draft: LineupDraft,
  selection: PitchSelection,
  pickedId: string,
  squad: readonly SquadCard[],
): LineupDraft {
  const picked = squad.find((player) => player.id === pickedId);
  if (!picked) return draft;
  const pickedRole = roleFromPositionId(picked.positionId);
  if (pickedRole !== selection.role) return draft;

  const alreadyOnLine = slotsForRole(draft, selection.role).includes(pickedId);
  const working = alreadyOnLine ? draft : draftWithoutPlayer(draft, pickedId);
  const line = [...slotsForRole(working, selection.role)];
  let fromIndex = line.indexOf(selection.playerId);
  if (fromIndex === -1 && isEmptySlotId(selection.playerId)) {
    const index = emptySlotIndex(selection.playerId);
    if (index == null) return working;
    while (line.length <= index) line.push("");
    line[index] = pickedId;
    return normalizeDraft(setSlotsForRole(working, selection.role, line));
  }
  if (fromIndex === -1) return working;

  const toIndex = line.indexOf(pickedId);
  if (toIndex === -1) {
    line[fromIndex] = pickedId;
    return normalizeDraft(setSlotsForRole(working, selection.role, line));
  }
  line[fromIndex] = pickedId;
  line[toIndex] = selection.playerId;
  return normalizeDraft(setSlotsForRole(working, selection.role, line));
}

export function lineupWriteBody(
  draft: LineupDraft,
  captainId: string | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    goalkeeper: draft.goalkeeper[0],
    defender: draft.defender,
    midfield: draft.midfield,
    striker: draft.striker,
    tactical_formation: [...draft.tactical],
  };
  const inLineup = allDraftPlayerIds(draft);
  if (captainId && inLineup.has(captainId)) body.captain = captainId;
  return body;
}

export function squadMatchesSearch(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return name.toLowerCase().includes(needle);
}
