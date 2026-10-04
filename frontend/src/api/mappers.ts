import teamsMasterFile from "../../../assets/teams_master.json";

export type ManagerInfo = {
  id?: string | number | null;
  managerName?: string | null;
  avatar?: string | null;
  profileImage?: string | null;
};

export type StandingRow = {
  position?: number | null;
  points?: number | null;
  teamId?: string | number | null;
  manager?: ManagerInfo | null;
  team?: {
    id?: string | number | null;
    teamValue?: number | null;
    avatar?: string | null;
    manager?: ManagerInfo | null;
  } | null;
};

export type RankingEntry = {
  teamId: string;
  selectable: boolean;
  position: number | null;
  name: string;
  avatarUrl: string | null;
  points: number | null;
  teamValue: number | null;
};

export type FantasyLeague = {
  id?: string | number | null;
  name?: string | null;
  team?: {
    id?: string | number | null;
    money?: number | null;
    teamValue?: number | null;
    manager?: ManagerInfo | null;
  } | null;
};

export type CurrentWeek = {
  previousWeek?: number | null;
  weekNumber?: number | null;
  openingWeekDate?: string | null;
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
  fixturePoints?: number | null;
  isMvp?: boolean;
};

export type ScoreTone = "red" | "yellow" | "green" | "blue";

export type FixtureScoreLookup = {
  week: number | null;
  pointsByMasterId?: ReadonlyMap<string, number>;
  mvpByMasterId?: ReadonlySet<string>;
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
  fixturePoints?: number | null;
  isMvp?: boolean;
  /** Current whole-euro market value from the roster, when Fantasy sent one. */
  marketValue: number | null;
  /** True when the roster already has an active market listing for this entry. */
  onMarket: boolean;
  /** Market listing id when this squad entry is for sale. */
  listingId: string | null;
  /** Current asking price of that listing, in whole euros. */
  salePrice: number | null;
};

const LINEUP_ROLES: readonly LineupRole[] = [
  "goalkeeper",
  "defender",
  "midfield",
  "striker",
];

const EMPTY_NAME = "Player name";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parses ISO strings or epoch timestamps (seconds or milliseconds). */
export function parseInstant(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }
  const raw = text(value);
  if (raw == null) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

export function idText(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isMvpFlag(record: Record<string, unknown> | null): boolean {
  if (!record) return false;
  const flag =
    record.isMvp ??
    record.isMVP ??
    record.mvp ??
    record.manOfTheMatch ??
    record.isManOfTheMatch ??
    record.motm;
  return flag === true || flag === 1 || flag === "true";
}

/** Score badge: red < 0, yellow = 0, green > 0, blue when the player is MVP. */
export function scoreTone(points: number, isMvp = false): ScoreTone {
  if (isMvp) return "blue";
  if (points > 0) return "green";
  if (points === 0) return "yellow";
  return "red";
}

export function weekPointsFromLastStats(master: unknown, week: number): number | null {
  const record = asRecord(master);
  const stats = record?.lastStats;
  if (!Array.isArray(stats)) return null;
  for (const entry of stats) {
    const row = asRecord(entry);
    if (!row) continue;
    if (asFiniteNumber(row.weekNumber) !== week) continue;
    return asFiniteNumber(row.totalPoints) ?? asFiniteNumber(row.weekPoints);
  }
  return null;
}

/** Index of master ``playerId`` → matchweek points from calendar stats. */
export function weekPointsByMasterId(stats: unknown): Map<string, number> {
  return weekScoreIndex(stats).pointsByMasterId;
}

/** Master ids marked MVP in calendar matchweek stats, when the flag exists. */
export function weekMvpMasterIds(stats: unknown): Set<string> {
  return weekScoreIndex(stats).mvpByMasterId;
}

function weekScoreIndex(stats: unknown): {
  pointsByMasterId: Map<string, number>;
  mvpByMasterId: Set<string>;
} {
  const pointsByMasterId = new Map<string, number>();
  const mvpByMasterId = new Set<string>();
  if (!Array.isArray(stats)) return { pointsByMasterId, mvpByMasterId };
  for (const match of stats) {
    const record = asRecord(match);
    if (!record) continue;
    for (const sideKey of ["local", "visitor"] as const) {
      const side = asRecord(record[sideKey]);
      const players = side?.players;
      if (!Array.isArray(players)) continue;
      for (const player of players) {
        const row = asRecord(player);
        const id = idText(row?.id);
        if (!id) continue;
        const points = asFiniteNumber(row?.weekPoints);
        if (points != null) pointsByMasterId.set(id, points);
        if (isMvpFlag(row)) mvpByMasterId.add(id);
      }
    }
  }
  return { pointsByMasterId, mvpByMasterId };
}

export function fixturePointsFromSlot(
  slot: unknown,
  lookup?: FixtureScoreLookup,
): number | null {
  const record = asRecord(slot);
  if (!record) return null;
  const master = asRecord(record.playerMaster);
  const fromSlot =
    asFiniteNumber(record.weekPoints) ??
    asFiniteNumber(record.points) ??
    asFiniteNumber(record.totalPoints);
  if (fromSlot != null) return fromSlot;
  const week = lookup?.week ?? null;
  if (week != null) {
    const fromHistory = weekPointsFromLastStats(master, week);
    if (fromHistory != null) return fromHistory;
  }
  const masterId = masterIdFromLineupSlot(record, master);
  if (masterId && lookup?.pointsByMasterId) {
    return lookup.pointsByMasterId.get(masterId) ?? null;
  }
  return null;
}

function weekMvpFromLastStats(
  master: Record<string, unknown> | null,
  week: number,
): boolean {
  const stats = master?.lastStats;
  if (!Array.isArray(stats)) return false;
  for (const entry of stats) {
    const row = asRecord(entry);
    if (!row) continue;
    if (asFiniteNumber(row.weekNumber) !== week) continue;
    return isMvpFlag(row);
  }
  return false;
}

export function fixtureMvpFromSlot(
  slot: unknown,
  lookup?: FixtureScoreLookup,
): boolean {
  const record = asRecord(slot);
  if (!record) return false;
  if (isMvpFlag(record)) return true;
  const master = asRecord(record.playerMaster);
  if (isMvpFlag(master)) return true;
  const week = lookup?.week ?? null;
  if (week != null && weekMvpFromLastStats(master, week)) return true;
  const masterId = masterIdFromLineupSlot(record, master);
  return Boolean(masterId && lookup?.mvpByMasterId?.has(masterId));
}

export function asLeagues(value: unknown): FantasyLeague[] {
  if (Array.isArray(value)) {
    return value.filter((item) => asRecord(item) != null) as FantasyLeague[];
  }
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ["leagues", "data", "items"] as const) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested.filter((item) => asRecord(item) != null) as FantasyLeague[];
    }
  }
  return [];
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
    openingWeekDate:
      typeof record.openingWeekDate === "string" ? record.openingWeekDate : null,
  };
}

function pluralCountdownUnit(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** Parses an ISO datetime string to epoch ms, or null when invalid. */
export function parseIsoTimestampMs(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function fixtureKickoffMs(fixture: Record<string, unknown>): number | null {
  const raw = fixture.matchDate ?? fixture.date;
  return typeof raw === "string" ? parseIsoTimestampMs(raw) : null;
}

/** Earliest upcoming fixture kickoff from a calendar week payload. */
export function nextFixtureKickoffMs(fixturesPayload: unknown, nowMs: number): number | null {
  const fixtures = asObjectList(fixturesPayload, ["fixtures", "matches", "data", "items"]);
  let best: number | null = null;
  for (const fixture of fixtures) {
    const kickoff = fixtureKickoffMs(fixture);
    if (kickoff == null || kickoff <= nowMs) continue;
    if (best == null || kickoff < best) best = kickoff;
  }
  return best;
}

/** ``X days Y hours Z minutes`` until ``targetMs`` (at least one minute when still in the future). */
export function formatFixtureCountdown(targetMs: number, nowMs: number): string {
  const left = Math.max(0, targetMs - nowMs);
  const totalMinutes = left === 0 ? 0 : Math.max(1, Math.ceil(left / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return [
    pluralCountdownUnit(days, "day"),
    pluralCountdownUnit(hours, "hour"),
    pluralCountdownUnit(minutes, "minute"),
  ].join(" ");
}

function asObjectList(
  value: unknown,
  wrapperKeys: readonly string[],
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => item != null);
  }
  const record = asRecord(value);
  if (!record) return [];
  for (const key of wrapperKeys) {
    if (Array.isArray(record[key])) return asObjectList(record[key], wrapperKeys);
  }
  return [record];
}

export function asStanding(value: unknown): StandingRow[] {
  return asObjectList(value, [
    "standing",
    "standings",
    "data",
    "items",
  ]) as StandingRow[];
}

export function teamIdOf(row: StandingRow): string {
  if (row.team?.id != null) return String(row.team.id);
  if (row.teamId != null) return String(row.teamId);
  return "";
}

function asHttpUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const url = raw.startsWith("//") ? `https:${raw}` : raw;
  if (/^https?:\/\//i.test(url)) return url;
  if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url)) return url;
  return null;
}

function avatarIdKeys(value: unknown): string[] {
  const raw = idText(value);
  if (!raw) return [];
  const normalized = raw.replace(/^0+/, "") || raw;
  return normalized === raw ? [raw] : [raw, normalized];
}

function avatarNameKey(value: unknown): string | null {
  const name = text(value);
  if (!name) return null;
  const normalized = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? `name:${normalized}` : null;
}

function firstImageUrl(value: unknown, depth = 0): string | null {
  const direct = asHttpUrl(value);
  if (direct) return direct;
  if (depth > 3) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImageUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const nested of Object.values(record)) {
    const found = firstImageUrl(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Reads a manager photo URL from standing, teams, or nested image maps. */
export function managerAvatarUrl(manager: unknown): string | null {
  const record = asRecord(manager);
  if (!record) return asHttpUrl(manager);
  return (
    asHttpUrl(record.avatar) ??
    asHttpUrl(record.profileImage) ??
    asHttpUrl(record.photo) ??
    asHttpUrl(record.photoUrl) ??
    asHttpUrl(record.imageUrl) ??
    asHttpUrl(record.avatarUrl) ??
    asHttpUrl(record.picture) ??
    firstImageUrl(record.avatar) ??
    firstImageUrl(record.profileImage) ??
    firstImageUrl(record.images) ??
    firstImageUrl(record.profile)
  );
}

function indexAvatar(
  map: Map<string, string>,
  key: string | null,
  url: string,
): void {
  if (key) map.set(key, url);
}

/** Indexes manager photos from ``GET /leagues/{id}/teams`` by team, manager, and name. */
export function avatarsByTeamId(teams: unknown): Map<string, string> {
  const map = new Map<string, string>();
  for (const record of asObjectList(teams, ["teams", "data", "items"])) {
    const players = Array.isArray(record.players) ? record.players : [];
    const playerManager = asRecord(players[0])?.manager;
    const url =
      managerAvatarUrl(record.manager) ??
      managerAvatarUrl(asRecord(record.team)?.manager) ??
      managerAvatarUrl(playerManager) ??
      asHttpUrl(record.avatar) ??
      asHttpUrl(record.profileImage);
    if (!url) continue;
    const manager =
      asRecord(record.manager) ??
      asRecord(asRecord(record.team)?.manager) ??
      asRecord(playerManager);
    const managerId = idText(manager?.id) ?? idText(record.managerId);
    for (const key of avatarIdKeys(record.id)) indexAvatar(map, key, url);
    for (const key of avatarIdKeys(record.teamId)) indexAvatar(map, key, url);
    for (const key of avatarIdKeys(asRecord(record.team)?.id)) {
      indexAvatar(map, key, url);
    }
    indexAvatar(map, managerId ? `manager:${managerId}` : null, url);
    indexAvatar(map, avatarNameKey(manager?.managerName), url);
  }
  return map;
}

/** Standing team ids that still need a squad fetch for a manager photo. */
export function teamIdsMissingAvatars(
  teamIds: readonly string[],
  avatars: ReadonlyMap<string, string>,
): string[] {
  return teamIds.filter((teamId) => !avatarIdKeys(teamId).some((key) => avatars.has(key)));
}

function rankingAvatarUrl(
  row: StandingRow,
  avatarByTeamId?: ReadonlyMap<string, string>,
): string | null {
  const teamId = teamIdOf(row);
  const manager = row.team?.manager ?? row.manager;
  const managerId = manager?.id == null ? null : String(manager.id);
  const fromLookup = avatarByTeamId
    ? [
        ...avatarIdKeys(teamId),
        ...(managerId ? [`manager:${managerId}`] : []),
        avatarNameKey(manager?.managerName),
      ]
        .filter((key): key is string => key != null)
        .map((key) => avatarByTeamId.get(key))
        .find((url) => url != null)
    : null;
  return (
    fromLookup ??
    managerAvatarUrl(manager) ??
    asHttpUrl(row.team?.avatar)
  );
}

/** Fills ranking photos from the signed-in manager when standing rows omit them. */
export function withCallerAvatar(
  ranking: readonly RankingEntry[],
  caller: {
    teamId?: string | null;
    name?: string | null;
    avatar?: string | null;
  },
): RankingEntry[] {
  const avatar = caller.avatar?.trim() || null;
  if (!avatar) return [...ranking];
  const callerIds = new Set(avatarIdKeys(caller.teamId));
  const callerName = avatarNameKey(caller.name);
  return ranking.map((row) => {
    if (row.avatarUrl) return row;
    const sameTeam = avatarIdKeys(row.teamId).some((id) => callerIds.has(id));
    const sameName = callerName != null && avatarNameKey(row.name) === callerName;
    return sameTeam || sameName ? { ...row, avatarUrl: avatar } : row;
  });
}

export function mapRanking(
  rows: readonly StandingRow[],
  avatarByTeamId?: ReadonlyMap<string, string>,
): RankingEntry[] {
  return rows
    .map((row, index) => {
      const teamId = teamIdOf(row);
      return {
        teamId: teamId || `row-${index}`,
        selectable: teamId.length > 0,
        position: row.position ?? null,
        name: row.team?.manager?.managerName?.trim() || "Opponent",
        avatarUrl: rankingAvatarUrl(row, avatarByTeamId),
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

export { formatEuro, formatTeamValue, pointsLabel } from "./format";

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

/** Latest matchweek with finished fixtures (excludes the open ``weekNumber``). */
export function lastPlayedWeek(current: CurrentWeek): number {
  if (current.previousWeek != null && current.previousWeek >= 1) {
    return current.previousWeek;
  }
  const open = current.weekNumber;
  if (open != null && open > 1) return open - 1;
  return 0;
}

/** Whether per-player fixture scores may be shown for the selected matchweek. */
export function fixtureScoresVisibleForWeek(week: number, current: CurrentWeek): boolean {
  if (week < 1) return false;
  return week <= lastPlayedWeek(current);
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

/** Sum of the lineup players' fixture points, or null when none has a score. */
export function lineupFixtureTotal(groups: readonly LineupGroup[]): number | null {
  const scores = groups
    .flatMap((group) => group.players)
    .filter((player) => !player.isEmpty)
    .map((player) => player.fixturePoints)
    .filter((points): points is number => points != null);
  return scores.length === 0 ? null : scores.reduce((total, points) => total + points, 0);
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

function buildTeamNameByTeamIdMap(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(teamsMasterFile)) return map;
  for (const entry of teamsMasterFile) {
    const record = asRecord(entry);
    const name = text(record?.name) ?? text(record?.shortName);
    if (!name) continue;
    const id = idText(record?.id);
    const dspId = idText(record?.dspId);
    if (id) map.set(id, name);
    if (dspId) map.set(dspId, name);
  }
  return map;
}

const TEAM_NAME_BY_TEAM_ID = buildTeamNameByTeamIdMap();

function teamBadgeFromTeamId(teamId: unknown): string | null {
  const id = idText(teamId);
  if (!id) return null;
  return TEAM_BADGE_BY_TEAM_ID.get(id) ?? null;
}

/** Resolves a club display name from a Fantasy team id (``id`` or ``dspId`` in teams master). */
export function teamNameFromTeamId(teamId: unknown): string | null {
  const id = idText(teamId);
  if (!id) return null;
  return TEAM_NAME_BY_TEAM_ID.get(id) ?? null;
}

function teamNameFromTeamRecord(team: unknown): string | null {
  const record = asRecord(team);
  if (!record) return null;
  return text(record.name) ?? text(record.shortName) ?? null;
}

function resolveTeamName(team: unknown, teamId: unknown): string | null {
  const teamRecord = asRecord(team);
  return (
    teamNameFromTeamRecord(team) ??
    teamNameFromTeamId(teamId) ??
    teamNameFromTeamId(teamRecord?.id) ??
    null
  );
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

/** Reads the club name from a player master record (inline team or teams master lookup). */
export function teamNameFromPlayerMaster(master: unknown): string | null {
  const record = asRecord(master);
  if (!record) return null;
  return resolveTeamName(record.team, record.teamId);
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
  scoreLookup?: FixtureScoreLookup,
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
  return {
    id,
    name: name ?? EMPTY_NAME,
    ...media,
    fixturePoints: fixturePointsFromSlot(record, scoreLookup),
    isMvp: fixtureMvpFromSlot(record, scoreLookup),
  };
}

/** Merges lineup slot media into the squad map (keeps roster data when present). */
export function enrichSquadMapFromLineup(
  squadById: ReadonlyMap<string, SquadCard>,
  lineup: unknown,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
  scoreLookup?: FixtureScoreLookup,
): Map<string, SquadCard> {
  const merged = new Map(squadById);
  for (const group of groupsFromLineup(lineup, catalogByMasterId, scoreLookup)) {
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
          fixturePoints: player.fixturePoints ?? null,
          isMvp: player.isMvp === true,
          marketValue: null,
          onMarket: false,
          listingId: null,
          salePrice: null,
        });
        continue;
      }
      merged.set(player.id, {
        ...existing,
        photoUrl: existing.photoUrl ?? player.photoUrl ?? null,
        teamBadgeUrl: existing.teamBadgeUrl ?? player.teamBadgeUrl ?? null,
        fixturePoints: existing.fixturePoints ?? player.fixturePoints ?? null,
        isMvp: existing.isMvp === true || player.isMvp === true,
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
  scoreLookup?: FixtureScoreLookup,
): LineupGroup[] {
  const record = asRecord(formation);
  if (!record) return [];
  return LINEUP_ROLES.map((role) => {
    const slots = record[role];
    const list = Array.isArray(slots) ? slots : [];
    return {
      role,
      players: list.map((slot, index) =>
        slotView(slot, index, catalogByMasterId, scoreLookup),
      ),
    };
  });
}

export function groupsFromLineup(
  lineup: unknown,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
  scoreLookup?: FixtureScoreLookup,
): LineupGroup[] {
  return lineupGroups(asRecord(lineup)?.formation, catalogByMasterId, scoreLookup);
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

function rosterMarketValue(record: Record<string, unknown> | null): number | null {
  const master = asRecord(record?.playerMaster);
  const raw = master?.marketValue ?? record?.marketValue;
  const value = asFiniteNumber(raw);
  if (value == null || value <= 0) return null;
  return Math.round(value);
}

function rosterListing(record: Record<string, unknown> | null): {
  listingId: string | null;
  salePrice: number | null;
} {
  const listing = asRecord(record?.playerMarket);
  if (!listing) return { listingId: null, salePrice: null };
  const sale = asFiniteNumber(listing.salePrice);
  return {
    listingId: idText(listing.id),
    salePrice: sale != null && sale > 0 ? Math.round(sale) : null,
  };
}

function rosterOnMarket(record: Record<string, unknown> | null): boolean {
  const listing = rosterListing(record);
  return listing.listingId != null || listing.salePrice != null;
}

export function squadCards(
  players: unknown,
  captainId: string | null,
  catalogByMasterId?: ReadonlyMap<string, PlayerMedia>,
  scoreLookup?: FixtureScoreLookup,
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
    const masterId = idText(master?.id);
    const week = scoreLookup?.week ?? null;
    const fixturePoints =
      (week != null ? weekPointsFromLastStats(master, week) : null) ??
      (masterId && scoreLookup?.pointsByMasterId
        ? (scoreLookup.pointsByMasterId.get(masterId) ?? null)
        : null);
    const isMvp =
      isMvpFlag(record) ||
      isMvpFlag(master) ||
      (week != null && weekMvpFromLastStats(master, week)) ||
      Boolean(masterId && scoreLookup?.mvpByMasterId?.has(masterId));
    return {
      id,
      name,
      captain: captainId != null && id === captainId,
      positionId,
      photoUrl: media.photoUrl ?? fromCatalog?.photoUrl ?? null,
      teamBadgeUrl: media.teamBadgeUrl ?? fromCatalog?.teamBadgeUrl ?? null,
      fixturePoints,
      isMvp,
      marketValue: rosterMarketValue(record),
      onMarket: rosterOnMarket(record),
      ...rosterListing(record),
    };
  });
}

export function playersOf(team: unknown): unknown {
  return asRecord(team)?.players ?? [];
}

/** Master ``playerId`` values from a team roster (deduplicated, stable order). */
export function masterPlayerIdsFromTeam(team: unknown): string[] {
  const players = playersOf(team);
  if (!Array.isArray(players)) return [];
  const ids: string[] = [];
  for (const entry of players) {
    const record = asRecord(entry);
    if (!record) continue;
    const master = asRecord(record.playerMaster);
    const id =
      idText(master?.id) ??
      idText(record.playerMasterId) ??
      idText(record.playerId);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

/** Parses squad size from a team payload. */
export function squadPlayerCountFromTeam(team: unknown): number | null {
  const players = playersOf(team);
  return Array.isArray(players) ? players.length : null;
}

/** Parses squad market value from a team or standing payload. */
export function teamValueFromPayload(data: unknown): number | null {
  const record = asRecord(data);
  return asFiniteNumber(record?.teamValue);
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
