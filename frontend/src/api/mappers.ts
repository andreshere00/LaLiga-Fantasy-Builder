export type StandingRow = {
  position?: number | null;
  points?: number | null;
  teamId?: string | number | null;
  team?: {
    id?: string | number | null;
    teamValue?: number | null;
    manager?: { managerName?: string | null } | null;
  } | null;
};

export type RankingEntry = {
  teamId: string;
  selectable: boolean;
  position: number | null;
  name: string;
  points: number | null;
  teamValue: number | null;
};

export type FantasyLeague = {
  id?: string | number | null;
  name?: string | null;
  team?: {
    id?: string | number | null;
    teamValue?: number | null;
  } | null;
};

export type CurrentWeek = {
  previousWeek?: number | null;
  weekNumber?: number | null;
};

export type LineupSlotView = {
  id: string;
  name: string;
};

export type LineupRole = "goalkeeper" | "defender" | "midfield" | "striker";

export type LineupGroup = {
  role: LineupRole;
  players: LineupSlotView[];
};

export type SquadCard = {
  id: string;
  name: string;
  captain: boolean;
};

const LINEUP_ROLES: readonly LineupRole[] = [
  "goalkeeper",
  "defender",
  "midfield",
  "striker",
];

const EMPTY_NAME = "Player name";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function idText(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function asLeagues(value: unknown): FantasyLeague[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => asRecord(item) != null) as FantasyLeague[];
}

export function leagueId(league: FantasyLeague): string {
  return league.id == null ? "" : String(league.id);
}

export function callerTeamId(league: FantasyLeague): string | null {
  if (league.team?.id == null) return null;
  return String(league.team.id);
}

export function leagueLabel(league: FantasyLeague | null): string {
  const name = league?.name?.trim();
  return name ? name : "League";
}

export function asCurrentWeek(value: unknown): CurrentWeek {
  const record = asRecord(value);
  if (!record) return {};
  return {
    previousWeek: typeof record.previousWeek === "number" ? record.previousWeek : null,
    weekNumber: typeof record.weekNumber === "number" ? record.weekNumber : null,
  };
}

export function asStanding(value: unknown): StandingRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => asRecord(item) != null) as StandingRow[];
}

export function teamIdOf(row: StandingRow): string {
  if (row.team?.id != null) return String(row.team.id);
  if (row.teamId != null) return String(row.teamId);
  return "";
}

export function mapRanking(rows: readonly StandingRow[]): RankingEntry[] {
  return rows
    .map((row, index) => {
      const teamId = teamIdOf(row);
      return {
        teamId: teamId || `row-${index}`,
        selectable: teamId.length > 0,
        position: row.position ?? null,
        name: row.team?.manager?.managerName?.trim() || "Opponent",
        points: row.points ?? null,
        teamValue: row.team?.teamValue ?? null,
      };
    })
    .sort((left, right) => {
      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
      return leftPosition - rightPosition;
    });
}

export function formatTeamValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("es-ES").format(value)} €`;
}

export function pointsLabel(points: number | null | undefined): string {
  if (points == null || Number.isNaN(points)) return "—";
  return `${new Intl.NumberFormat("es-ES").format(points)} p`;
}

export function formationLabel(value: readonly number[] | null | undefined): string {
  if (!value || value.length === 0) return "—";
  return value.join("-");
}

export function scoreWeekLabel(week: number): string {
  return `F${week}`;
}

export function defaultWeek(current: CurrentWeek): number {
  if (current.previousWeek != null && current.previousWeek >= 1) return current.previousWeek;
  if (current.weekNumber != null && current.weekNumber >= 1) return current.weekNumber;
  return 1;
}

export function maxWeek(current: CurrentWeek): number {
  if (current.weekNumber != null && current.weekNumber >= 1) return current.weekNumber;
  return 1;
}

export function clampWeek(week: number, upperBound: number): number {
  const upper = upperBound >= 1 ? upperBound : 1;
  if (week < 1) return 1;
  if (week > upper) return upper;
  return week;
}

export function weekPointsForTeam(rows: readonly StandingRow[], teamId: string): number | null {
  const match = rows.find((row) => teamIdOf(row) === teamId);
  if (!match || match.points == null) return null;
  return match.points;
}

export function selectedTeamValue(
  ranking: readonly RankingEntry[],
  teamId: string | null,
  callerId: string | null,
  callerValue: number | null | undefined,
): number | null {
  if (!teamId) return null;
  const row = ranking.find((item) => item.teamId === teamId);
  if (row?.teamValue != null) return row.teamValue;
  if (teamId === callerId && callerValue != null) return callerValue;
  return null;
}

export function possessiveName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "Your";
  return `${trimmed}’s`;
}

export function slotView(slot: unknown, index: number): LineupSlotView {
  const record = asRecord(slot);
  if (!record) {
    return { id: idText(slot) ?? `slot-${index}`, name: EMPTY_NAME };
  }
  const master = asRecord(record.playerMaster);
  const name =
    text(master?.nickname) ?? text(master?.name) ?? text(record.nickname) ?? text(record.name);
  const id = idText(record.playerTeamId) ?? idText(record.id) ?? `slot-${index}`;
  return { id, name: name ?? EMPTY_NAME };
}

export function captainIdOf(value: unknown): string | null {
  const direct = idText(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return null;
  return idText(record.playerTeamId) ?? idText(record.id);
}

export function lineupGroups(formation: unknown): LineupGroup[] {
  const record = asRecord(formation);
  if (!record) return [];
  return LINEUP_ROLES.map((role) => {
    const slots = record[role];
    const list = Array.isArray(slots) ? slots : [];
    return { role, players: list.map((slot, index) => slotView(slot, index)) };
  });
}

export function groupsFromLineup(lineup: unknown): LineupGroup[] {
  return lineupGroups(asRecord(lineup)?.formation);
}

export function tacticalOf(lineup: unknown): number[] | null {
  const tactical = asRecord(asRecord(lineup)?.formation)?.tacticalFormation;
  if (!Array.isArray(tactical) || tactical.length === 0) return null;
  if (!tactical.every((item) => typeof item === "number")) return null;
  return tactical;
}

export function captainFromLineup(lineup: unknown): string | null {
  return captainIdOf(asRecord(asRecord(lineup)?.formation)?.captain);
}

export function squadCards(players: unknown, captainId: string | null): SquadCard[] {
  if (!Array.isArray(players)) return [];
  return players.map((player, index) => {
    const record = asRecord(player);
    const master = asRecord(record?.playerMaster);
    const id = idText(record?.playerTeamId) ?? `player-${index}`;
    const name = text(master?.nickname) ?? text(master?.name) ?? EMPTY_NAME;
    return { id, name, captain: captainId != null && id === captainId };
  });
}

export function playersOf(team: unknown): unknown {
  return asRecord(team)?.players ?? [];
}

export function hasPlayers(groups: readonly LineupGroup[]): boolean {
  return groups.some((group) => group.players.length > 0);
}
