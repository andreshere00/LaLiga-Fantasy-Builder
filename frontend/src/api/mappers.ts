import teamsMasterFile from "../../../assets/teams_master.json";

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

export type PlayerMedia = {
  photoUrl: string | null;
  teamBadgeUrl: string | null;
};

export type LineupSlotView = {
  id: string;
  name: string;
  isEmpty?: boolean;
  photoUrl?: string | null;
  teamBadgeUrl?: string | null;
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
  positionId: number | null;
  photoUrl: string | null;
  teamBadgeUrl: string | null;
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
  if (current.weekNumber != null && current.weekNumber >= 1) return current.weekNumber;
  if (current.previousWeek != null && current.previousWeek >= 1) return current.previousWeek;
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

function teamBadgeUrlFromTeamRecord(team: unknown): string | null {
  const record = asRecord(team);
  if (!record) return null;
  return text(record.badgeColor) ?? text(record.badgeWhite) ?? null;
}

function buildTeamBadgeByTeamIdMap(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(teamsMasterFile)) return map;
  for (const entry of teamsMasterFile) {
    const record = asRecord(entry);
    const badge = teamBadgeUrlFromTeamRecord(entry);
    if (!badge) continue;
    const id = idText(record?.id);
    const dspId = idText(record?.dspId);
    if (id) map.set(id, badge);
    if (dspId) map.set(dspId, badge);
  }
  return map;
}

const TEAM_BADGE_BY_TEAM_ID = buildTeamBadgeByTeamIdMap();

function teamBadgeFromTeamId(teamId: unknown): string | null {
  const id = idText(teamId);
  if (!id) return null;
  return TEAM_BADGE_BY_TEAM_ID.get(id) ?? null;
}

function resolveTeamBadgeUrl(team: unknown, teamId: unknown): string | null {
  const teamRecord = asRecord(team);
  return (
    teamBadgeUrlFromTeamRecord(team) ??
    teamBadgeFromTeamId(teamId) ??
    teamBadgeFromTeamId(teamRecord?.id) ??
    null
  );
}

export function mediaFromPlayerMaster(master: unknown): PlayerMedia {
  const record = asRecord(master);
  if (!record) return { photoUrl: null, teamBadgeUrl: null };
  const images = asRecord(record.images);
  const transparent = asRecord(images?.transparent);
  const photoUrl =
    text(transparent?.["256x256"]) ??
    text(transparent?.["128x128"]) ??
    text(transparent?.["64x64"]) ??
    null;
  const teamBadgeUrl = resolveTeamBadgeUrl(record.team, record.teamId);
  return { photoUrl, teamBadgeUrl };
}

function masterIdFromLineupSlot(
  record: Record<string, unknown>,
  master: Record<string, unknown> | null,
): string | null {
  return (
    idText(record.playerMasterId) ??
    idText(master?.id) ??
    idText(record.playerId)
  );
}

function mediaFromCatalogEntry(
  catalogByMasterId: ReadonlyMap<string, PlayerMedia> | undefined,
  masterId: string | null,
): PlayerMedia | null {
  if (!masterId || !catalogByMasterId) return null;
  return catalogByMasterId.get(masterId) ?? null;
}

/** Index of master ``playerId`` → photo and club crest from ``GET /players``. */
export function catalogMediaByMasterId(catalog: unknown): Map<string, PlayerMedia> {
  const map = new Map<string, PlayerMedia>();
  if (!Array.isArray(catalog)) return map;
  for (const entry of catalog) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = idText(record.id);
    if (!id) continue;
    map.set(id, mediaFromPlayerMaster(record));
  }
  return map;
}

/** Reads photo and club crest from a Fantasy lineup slot (week or current). */
export function mediaFromLineupSlot(
  slot: unknown,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
): PlayerMedia {
  const record = asRecord(slot);
  if (!record) return { photoUrl: null, teamBadgeUrl: null };
  const master = asRecord(record.playerMaster);
  const fromMaster = mediaFromPlayerMaster(master);
  const playerTeam = asRecord(record.playerTeam);
  const fromCatalog = mediaFromCatalogEntry(
    catalogByMasterId,
    masterIdFromLineupSlot(record, master),
  );
  const teamBadgeUrl =
    fromMaster.teamBadgeUrl ??
    resolveTeamBadgeUrl(record.team, record.teamId) ??
    resolveTeamBadgeUrl(playerTeam, playerTeam?.teamId) ??
    resolveTeamBadgeUrl(playerTeam?.team, null) ??
    fromCatalog?.teamBadgeUrl ??
    resolveTeamBadgeUrl(null, master?.teamId) ??
    null;
  const photoUrl = fromMaster.photoUrl ?? fromCatalog?.photoUrl ?? null;
  return { photoUrl, teamBadgeUrl };
}

export function slotView(
  slot: unknown,
  index: number,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
): LineupSlotView {
  const record = asRecord(slot);
  if (!record) {
    return { id: idText(slot) ?? `slot-${index}`, name: EMPTY_NAME };
  }
  const master = asRecord(record.playerMaster);
  const name =
    text(master?.nickname) ?? text(master?.name) ?? text(record.nickname) ?? text(record.name);
  const id = idText(record.playerTeamId) ?? idText(record.id) ?? `slot-${index}`;
  const media = mediaFromLineupSlot(record, catalogByMasterId);
  return { id, name: name ?? EMPTY_NAME, ...media };
}

/** Merges lineup slot media into the squad map (keeps roster data when present). */
export function enrichSquadMapFromLineup(
  squadById: ReadonlyMap<string, SquadCard>,
  lineup: unknown,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
): Map<string, SquadCard> {
  const merged = new Map(squadById);
  for (const group of groupsFromLineup(lineup, catalogByMasterId)) {
    for (const player of group.players) {
      if (!player.id || player.isEmpty) continue;
      const existing = merged.get(player.id);
      if (!existing) {
        merged.set(player.id, {
          id: player.id,
          name: player.name,
          captain: false,
          positionId: null,
          photoUrl: player.photoUrl ?? null,
          teamBadgeUrl: player.teamBadgeUrl ?? null,
        });
        continue;
      }
      merged.set(player.id, {
        ...existing,
        photoUrl: existing.photoUrl ?? player.photoUrl ?? null,
        teamBadgeUrl: existing.teamBadgeUrl ?? player.teamBadgeUrl ?? null,
      });
    }
  }
  return merged;
}

export function captainIdOf(value: unknown): string | null {
  const direct = idText(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return null;
  return idText(record.playerTeamId) ?? idText(record.id);
}

export function lineupGroups(
  formation: unknown,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
): LineupGroup[] {
  const record = asRecord(formation);
  if (!record) return [];
  return LINEUP_ROLES.map((role) => {
    const slots = record[role];
    const list = Array.isArray(slots) ? slots : [];
    return {
      role,
      players: list.map((slot, index) => slotView(slot, index, catalogByMasterId)),
    };
  });
}

export function groupsFromLineup(
  lineup: unknown,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
): LineupGroup[] {
  return lineupGroups(asRecord(lineup)?.formation, catalogByMasterId);
}

export function tacticalOf(lineup: unknown): number[] | null {
  const formation = asRecord(asRecord(lineup)?.formation);
  const tactical = formation?.tacticalFormation ?? formation?.tactical_formation;
  if (!Array.isArray(tactical) || tactical.length === 0) return null;
  if (!tactical.every((item) => typeof item === "number")) return null;
  return tactical;
}

export function captainFromLineup(lineup: unknown): string | null {
  return captainIdOf(asRecord(asRecord(lineup)?.formation)?.captain);
}

export function squadCards(
  players: unknown,
  captainId: string | null,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
): SquadCard[] {
  if (!Array.isArray(players)) return [];
  return players.map((player, index) => {
    const record = asRecord(player);
    const master = asRecord(record?.playerMaster);
    const id = idText(record?.playerTeamId) ?? `player-${index}`;
    const name = text(master?.nickname) ?? text(master?.name) ?? EMPTY_NAME;
    const positionRaw = master?.positionId;
    const positionId = typeof positionRaw === "number" ? positionRaw : null;
    const media = mediaFromPlayerMaster(master);
    const fromCatalog = mediaFromCatalogEntry(
      catalogByMasterId,
      idText(master?.id),
    );
    return {
      id,
      name,
      captain: captainId != null && id === captainId,
      positionId,
      photoUrl: media.photoUrl ?? fromCatalog?.photoUrl ?? null,
      teamBadgeUrl: media.teamBadgeUrl ?? fromCatalog?.teamBadgeUrl ?? null,
    };
  });
}

export function playersOf(team: unknown): unknown {
  return asRecord(team)?.players ?? [];
}

export function hasPlayers(groups: readonly LineupGroup[]): boolean {
  return groups.some((group) => group.players.length > 0);
}

export type LineupsAvailable = {
  free: string[];
  premium: string[];
};

function stringFormationCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string" && item.trim().length > 0) return item.trim();
      if (Array.isArray(item) && item.length === 3 && item.every((n) => typeof n === "number")) {
        return item.join(",");
      }
      return null;
    })
    .filter((item): item is string => item != null);
}

function lineupsAvailableRecord(value: unknown): LineupsAvailable | null {
  const record = asRecord(value);
  if (!record) return null;
  const free = stringFormationCodes(record.free);
  if (free.length === 0) return null;
  return { free, premium: stringFormationCodes(record.premium) };
}

/** Parse free/premium formation codes from a lineup API payload when present. */
export function lineupsAvailableFromLineup(lineup: unknown): LineupsAvailable | null {
  const record = asRecord(lineup);
  if (!record) return null;
  const candidates = [
    record.lineupsAvailable,
    record.lineups_available,
    record.availableLineups,
    record.available_lineups,
    record,
  ];
  for (const candidate of candidates) {
    const parsed = lineupsAvailableRecord(candidate);
    if (parsed) return parsed;
  }
  return null;
}

export function freeFormationCodesFromLineup(lineup: unknown): readonly string[] | null {
  const available = lineupsAvailableFromLineup(lineup);
  if (!available || available.free.length === 0) return null;
  return available.free;
}
