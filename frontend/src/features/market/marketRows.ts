import {
  asFiniteNumber,
  asRecord,
  idText,
  mediaFromPlayerMaster,
  text,
} from "../../api/mappers";

export type Availability = "available" | "questionable" | "unavailable";

export type MarketRow = {
  id: string;
  playerId: string | null;
  name: string;
  positionId: number | null;
  photoUrl: string | null;
  teamBadgeUrl: string | null;
  points: number | null;
  form: number | null;
  formRecent: readonly number[];
  formRecentWeeks: readonly number[];
  averagePoints: number | null;
  marketValue: number | null;
  variation: number | null;
  variationPercent: number | null;
  availability: Availability;
  expiresAt: number | null;
  seller: string;
};

export type ValuePoint = { time: number; value: number };

const FORM_MATCHES = 5;
export const FORM_DISPLAY_MATCHES = 3;
const COACH_POSITION_ID = 5;
const VARIATION_DAYS = 5;
const DAY_MS = 86_400_000;
const LALIGA_SELLER = "LALIGA";
const LIST_KEYS: readonly string[] = ["marketPlayers", "market", "players", "items", "data"];
const QUESTIONABLE = new Set(["doubtful", "questionable", "uncertain", "doubt"]);
const AVAILABLE = new Set(["ok", "available", "fit", "active"]);

/** Extracts the listing records from a market snapshot, whatever the wrapper key. */
export function marketItems(snapshot: unknown): Record<string, unknown>[] {
  const toRecords = (list: unknown[]) =>
    list.map(asRecord).filter((item): item is Record<string, unknown> => item != null);
  if (Array.isArray(snapshot)) return toRecords(snapshot);
  const record = asRecord(snapshot);
  if (!record) return [];
  for (const key of LIST_KEYS) {
    const nested = record[key];
    if (Array.isArray(nested)) return toRecords(nested);
    if (asRecord(nested)) {
      const inner = marketItems(nested);
      if (inner.length > 0) return inner;
    }
  }
  return [];
}

function masterOf(item: Record<string, unknown>): Record<string, unknown> | null {
  const playerTeam = asRecord(item.playerTeam);
  return (
    asRecord(item.playerMaster) ??
    asRecord(playerTeam?.playerMaster) ??
    asRecord(item.player)
  );
}

/** Master player id of a market item, used to join catalog and value history. */
export function masterIdOf(item: Record<string, unknown>): string | null {
  const master = masterOf(item);
  return idText(master?.id) ?? idText(item.playerMasterId) ?? null;
}

/** Maps the Fantasy ``playerStatus`` string to the three displayed states. */
export function availabilityOf(status: unknown): Availability {
  const value = text(status)?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
  if (value == null || AVAILABLE.has(value)) return "available";
  return QUESTIONABLE.has(value) ? "questionable" : "unavailable";
}

function recentFormWeeks(lastStats: unknown): { week: number; points: number }[] {
  if (!Array.isArray(lastStats)) return [];
  return lastStats
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => row != null)
    .map((row) => ({
      week: asFiniteNumber(row.weekNumber) ?? 0,
      points:
        asFiniteNumber(row.totalPoints) ?? asFiniteNumber(row.weekPoints),
    }))
    .filter((row): row is { week: number; points: number } => row.points != null)
    .sort((left, right) => right.week - left.week)
    .slice(0, FORM_MATCHES);
}

/** Sum of the points from the latest five played matchweeks. */
export function formPoints(lastStats: unknown): number | null {
  const weeks = recentFormWeeks(lastStats);
  return weeks.length === 0 ? null : weeks.reduce((sum, row) => sum + row.points, 0);
}

/** Latest five matchweek scores, newest first. */
export function formRecentPoints(lastStats: unknown): number[] {
  return recentFormWeeks(lastStats).map((row) => row.points);
}

/** Matchweek numbers aligned with ``formRecentPoints`` (newest first, at most three). */
export function formRecentWeekNumbers(lastStats: unknown): number[] {
  return recentFormWeeks(lastStats)
    .map((row) => row.week)
    .slice(0, FORM_DISPLAY_MATCHES);
}

/** Newest-first scores for the form column (last three matchweeks). */
export function formDisplayPoints(recent: readonly number[]): number[] {
  return recent.slice(0, FORM_DISPLAY_MATCHES);
}

/** Display name for a market row; coaches are labeled explicitly. */
export function marketDisplayName(
  nickname: string | null,
  fullName: string | null,
  positionId: number | null,
): string {
  const base = nickname ?? fullName ?? "Player";
  return positionId === COACH_POSITION_ID ? `${base} (Coach)` : base;
}

/** Maps Fantasy ``positionId`` to the market list abbreviation. */
export function positionAbbrev(positionId: number | null): string {
  switch (positionId) {
    case 1:
      return "GK";
    case 2:
      return "DEF";
    case 3:
      return "MDF";
    case 4:
      return "FWD";
    case 5:
      return "COA";
    default:
      return "—";
  }
}

/** CSS tone suffix for position role colors on the market list. */
export function positionTone(positionId: number | null): string {
  switch (positionId) {
    case 1:
      return "gk";
    case 2:
      return "def";
    case 3:
      return "mdf";
    case 4:
      return "fwd";
    case 5:
      return "coa";
    default:
      return "unknown";
  }
}

function lastStatsFromLeagueCard(card: unknown): unknown {
  const record = asRecord(card);
  const master = asRecord(record?.playerMaster);
  return master?.lastStats ?? record?.lastStats;
}

/** Matchweek numbers from ``current`` down to 1 (newest first, at most ``count``). */
export function recentFormWeekNumbers(
  currentWeek: number,
  count = FORM_MATCHES,
): number[] {
  if (!Number.isFinite(currentWeek) || currentWeek < 1) return [];
  const weeks: number[] = [];
  for (let week = currentWeek; week >= 1 && weeks.length < count; week -= 1) {
    weeks.push(week);
  }
  return weeks;
}

/** Form totals from calendar matchweek stats when ``lastStats`` is absent. */
export function formFromCalendarWeeks(
  playerId: string | null,
  weekNumbers: readonly number[],
  statsByWeek: ReadonlyMap<number, ReadonlyMap<string, number>>,
): { form: number | null; formRecent: number[] } {
  if (!playerId || weekNumbers.length === 0) {
    return { form: null, formRecent: [] };
  }
  const formRecent = weekNumbers.map(
    (week) => statsByWeek.get(week)?.get(playerId) ?? 0,
  );
  return { form: formRecent.reduce((sum, points) => sum + points, 0), formRecent };
}

/** Parses ``GET /players/{id}/market-value`` into an ascending value series. */
export function valueSeries(history: unknown): ValuePoint[] {
  if (!Array.isArray(history)) return [];
  const points: ValuePoint[] = [];
  for (const entry of history) {
    const row = asRecord(entry);
    const value = asFiniteNumber(row?.marketValue);
    const time = typeof row?.date === "string" ? Date.parse(row.date) : Number.NaN;
    if (value != null && Number.isFinite(time)) points.push({ time, value });
  }
  return points.sort((left, right) => left.time - right.time);
}

/** Difference between the latest value and the value five days earlier. */
export function valueVariation(series: readonly ValuePoint[]): number | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  const cutoff = latest.time - VARIATION_DAYS * DAY_MS;
  const reference = [...series].reverse().find((point) => point.time <= cutoff) ?? series[0];
  return latest.value - reference.value;
}

/** Relative change over five days, as a percentage of the reference value. */
export function valueVariationPercent(series: readonly ValuePoint[]): number | null {
  const delta = valueVariation(series);
  if (delta == null || series.length < 2) return null;
  const latest = series[series.length - 1];
  const reference = latest.value - delta;
  if (reference === 0) return null;
  return (delta / reference) * 100;
}

/** Whole milliseconds left until expiry, or null when the date is unknown. */
export function remainingMs(expiresAt: number | null, now: number): number | null {
  return expiresAt == null ? null : Math.max(0, expiresAt - now);
}

/** Human label such as ``2d 3h``, ``5h 10m`` or ``Expired``. */
export function remainingLabel(expiresAt: number | null, now: number): string {
  const left = remainingMs(expiresAt, now);
  if (left == null) return "—";
  if (left === 0) return "Expired";
  const minutes = Math.floor(left / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function managerNameOf(value: unknown): string | null {
  const record = asRecord(value);
  return text(record?.managerName) ?? text(record?.name) ?? null;
}

function sellerOf(item: Record<string, unknown>): string {
  const sellerTeam = asRecord(item.sellerTeam);
  const fromSellerTeam = managerNameOf(sellerTeam?.manager);
  if (fromSellerTeam) return fromSellerTeam;

  const playerTeam = asRecord(item.playerTeam);
  const fromPlayerTeam = managerNameOf(playerTeam?.manager);
  if (fromPlayerTeam) return fromPlayerTeam;

  for (const candidate of [item.seller, item.manager, item.team]) {
    const name = managerNameOf(candidate) ?? text(candidate);
    if (name) return name;
  }

  return LALIGA_SELLER;
}

function expiryOf(item: Record<string, unknown>): number | null {
  const market = asRecord(item.playerMarket);
  const raw = text(item.expirationDate) ?? text(market?.expirationDate);
  const time = raw == null ? Number.NaN : Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

/** Joins a market item with its catalog card and value history into a list row. */
export function marketRow(
  item: Record<string, unknown>,
  index: number,
  catalog: ReadonlyMap<string, Record<string, unknown>>,
  history: ReadonlyMap<string, readonly ValuePoint[]>,
  leagueCards: ReadonlyMap<string, unknown> = new Map(),
  calendarForm?: {
    weekNumbers: readonly number[];
    statsByWeek: ReadonlyMap<number, ReadonlyMap<string, number>>;
  },
): MarketRow {
  const playerId = masterIdOf(item);
  const fromCatalog = playerId ? catalog.get(playerId) : null;
  const fromMarket = masterOf(item);
  const leagueCard = playerId ? leagueCards.get(playerId) : null;
  const cardMaster = asRecord(asRecord(leagueCard)?.playerMaster);
  const master: Record<string, unknown> = {
    ...fromCatalog,
    ...fromMarket,
    ...cardMaster,
    lastStats:
      fromMarket?.lastStats ??
      fromCatalog?.lastStats ??
      cardMaster?.lastStats ??
      lastStatsFromLeagueCard(leagueCard),
  };
  const media = mediaFromPlayerMaster(master);
  const valueHistory = playerId ? (history.get(playerId) ?? []) : [];
  const positionId = asFiniteNumber(master.positionId);
  let form = formPoints(master.lastStats);
  let formRecent = formRecentPoints(master.lastStats);
  let formRecentWeeks = formRecentWeekNumbers(master.lastStats);
  if (form == null && calendarForm) {
    const fromCalendar = formFromCalendarWeeks(
      playerId,
      calendarForm.weekNumbers,
      calendarForm.statsByWeek,
    );
    form = fromCalendar.form;
    formRecent = fromCalendar.formRecent;
    formRecentWeeks = calendarForm.weekNumbers.slice(0, FORM_DISPLAY_MATCHES);
  }
  return {
    id: idText(item.id) ?? idText(item.playerTeamId) ?? playerId ?? `row-${index}`,
    playerId,
    name: marketDisplayName(
      text(master.nickname),
      text(master.name),
      positionId,
    ),
    positionId,
    ...media,
    points: asFiniteNumber(master.points),
    form,
    formRecent,
    formRecentWeeks,
    averagePoints: asFiniteNumber(master.averagePoints),
    marketValue: asFiniteNumber(master.marketValue),
    variation: valueVariation(valueHistory),
    variationPercent: valueVariationPercent(valueHistory),
    availability: availabilityOf(master.playerStatus),
    expiresAt: expiryOf(item),
    seller: sellerOf(item),
  };
}

/** Indexes catalog entries by master id. */
export function catalogById(catalog: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(catalog)) return map;
  for (const entry of catalog) {
    const record = asRecord(entry);
    const id = idText(record?.id);
    if (record && id) map.set(id, record);
  }
  return map;
}
