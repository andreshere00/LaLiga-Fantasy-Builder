import { normalizeSearchText } from "../../searchText";
import type { Availability } from "../market/model/availability";
import type { NumericRange } from "../market/marketFilters";
import { createEmptyMarketFilters, type MarketFilters } from "../market/marketFilters";

export type PlayersFilters = Omit<MarketFilters, "seller"> & {
  owner: string;
  team: string;
};

export type PlayersListUrlState = {
  filters: PlayersFilters;
  page: number | null;
};

const AVAIL_TOKENS = new Set<Availability>(["available", "questionable", "unavailable"]);

export function createEmptyPlayersFilters(): PlayersFilters {
  const base = createEmptyMarketFilters();
  return {
    query: base.query,
    player: base.player,
    owner: "",
    team: "",
    marketValue: base.marketValue,
    points: base.points,
    form: base.form,
    availability: base.availability,
    positions: base.positions,
  };
}

export function isPlayersLeaderboardView(filters: PlayersFilters): boolean {
  if (normalizeSearchText(filters.query)) return false;
  if (normalizeSearchText(filters.player)) return false;
  if (normalizeSearchText(filters.owner)) return false;
  if (normalizeSearchText(filters.team)) return false;
  if (filters.marketValue.min != null || filters.marketValue.max != null) return false;
  if (filters.points.min != null || filters.points.max != null) return false;
  if (filters.form.min != null || filters.form.max != null) return false;
  if (filters.availability.size > 0) return false;
  if (filters.positions.size > 0) return false;
  return true;
}

function parseRange(minRaw: string | null, maxRaw: string | null): NumericRange {
  const min = minRaw != null && minRaw !== "" ? Number(minRaw) : null;
  const max = maxRaw != null && maxRaw !== "" ? Number(maxRaw) : null;
  const minOk = min != null && Number.isFinite(min) ? min : null;
  const maxOk = max != null && Number.isFinite(max) ? max : null;
  if (minOk != null && maxOk != null && minOk > maxOk) {
    return { min: null, max: null };
  }
  return { min: minOk, max: maxOk };
}

function parseAvail(raw: string | null): ReadonlySet<Availability> {
  if (!raw) return new Set();
  const set = new Set<Availability>();
  for (const token of raw.split(",")) {
    const trimmed = token.trim() as Availability;
    if (AVAIL_TOKENS.has(trimmed)) set.add(trimmed);
  }
  return set;
}

function parsePos(raw: string | null): ReadonlySet<number> {
  if (!raw) return new Set();
  const set = new Set<number>();
  for (const token of raw.split(",")) {
    const n = Number(token.trim());
    if (Number.isInteger(n) && n >= 1 && n <= 5) set.add(n);
  }
  return set;
}

export function parsePlayersSearchParams(params: URLSearchParams): PlayersListUrlState {
  const filters = createEmptyPlayersFilters();
  filters.query = params.get("q")?.trim() ?? "";
  filters.player = params.get("name")?.trim() ?? "";
  filters.owner = params.get("owner")?.trim() ?? "";
  filters.team = params.get("team")?.trim() ?? "";
  filters.marketValue = parseRange(params.get("mvMin"), params.get("mvMax"));
  filters.points = parseRange(params.get("fsypMin"), params.get("fsypMax"));
  filters.form = parseRange(params.get("formMin"), params.get("formMax"));
  filters.availability = parseAvail(params.get("avail"));
  filters.positions = parsePos(params.get("pos"));

  const leaderboard = isPlayersLeaderboardView(filters);
  if (leaderboard) {
    return { filters, page: null };
  }
  const pageRaw = params.get("page");
  const pageNum = pageRaw != null ? Number(pageRaw) : 1;
  const page =
    Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1;
  return { filters, page: page > 1 ? page : null };
}

export function serializePlayersSearchParams(state: PlayersListUrlState): URLSearchParams {
  const out = new URLSearchParams();
  const { filters } = state;
  if (filters.query.trim()) out.set("q", filters.query.trim());
  if (filters.player.trim()) out.set("name", filters.player.trim());
  if (filters.owner.trim()) out.set("owner", filters.owner.trim());
  if (filters.team.trim()) out.set("team", filters.team.trim());
  if (filters.marketValue.min != null) out.set("mvMin", String(filters.marketValue.min));
  if (filters.marketValue.max != null) out.set("mvMax", String(filters.marketValue.max));
  if (filters.points.min != null) out.set("fsypMin", String(filters.points.min));
  if (filters.points.max != null) out.set("fsypMax", String(filters.points.max));
  if (filters.form.min != null) out.set("formMin", String(filters.form.min));
  if (filters.form.max != null) out.set("formMax", String(filters.form.max));
  if (filters.availability.size > 0) {
    out.set("avail", [...filters.availability].sort().join(","));
  }
  if (filters.positions.size > 0) {
    out.set("pos", [...filters.positions].sort((a, b) => a - b).join(","));
  }
  if (!isPlayersLeaderboardView(filters) && state.page != null && state.page > 1) {
    out.set("page", String(state.page));
  }
  return out;
}

export function withPlayersFilters(
  base: URLSearchParams,
  patch: Partial<PlayersFilters>,
): URLSearchParams {
  const current = parsePlayersSearchParams(base);
  const next: PlayersFilters = { ...current.filters, ...patch };
  return serializePlayersSearchParams({ filters: next, page: null });
}

/** Page index shown in the pager, never past the last page of results. */
export function clampPlayersPage(page: number | null, totalPages: number): number {
  const pages = Math.max(1, totalPages);
  const requested = page ?? 1;
  if (!Number.isInteger(requested) || requested < 1) return 1;
  return Math.min(requested, pages);
}

export function withPlayersPage(base: URLSearchParams, page: number): URLSearchParams {
  const current = parsePlayersSearchParams(base);
  if (isPlayersLeaderboardView(current.filters)) {
    return serializePlayersSearchParams({ filters: current.filters, page: null });
  }
  return serializePlayersSearchParams({
    filters: current.filters,
    page: page > 1 ? page : null,
  });
}
