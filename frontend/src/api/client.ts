import { ApiContractError, ApiError, NeedsReauthError } from "./errors";
import {
  endpointRequestSchema,
  validateEndpointInput,
  endpointResponseSchema,
  errorResponseSchema,
  pathSegmentSchema,
  playerStatsDetailQuerySchema,
  positivePathNumberSchema,
  standingsQuerySchema,
  serializeEndpointRequest,
  type ApiResponseDto,
  type CompetitionStandingsDto,
  type PlayerStatsDetailQuery,
} from "./schemas";

export type { PlayerStatsDetailQuery } from "./schemas";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GetJsonOptions = {
  fetchFn?: FetchLike;
  signal?: AbortSignal;
};

function segment(value: string): string {
  return encodeURIComponent(pathSegmentSchema.parse(value));
}

function weekNumber(value: number): number {
  return positivePathNumberSchema.parse(value);
}

export const paths = {
  competitionStandings: (
    competitionId = 1,
    season?: number,
    mode: "live" | "completed" = "completed",
  ): `/api/competitions/${number}/standings?${string}` => {
    const query = standingsQuerySchema.parse({ season, mode });
    const params = new URLSearchParams({ mode: query.mode ?? "completed" });
    if (query.season !== undefined) params.set("season", String(query.season));
    return `/api/competitions/${positivePathNumberSchema.parse(competitionId)}/standings?${params}`;
  },
  leagues: () => "/api/leagues",
  standing: (leagueId: string) => `/api/leagues/${segment(leagueId)}/standing`,
  weekStanding: (leagueId: string, week: number) =>
    `/api/leagues/${segment(leagueId)}/standing/${weekNumber(week)}`,
  currentWeek: () => "/api/calendar/current",
  weekFixtures: (week: number) => `/api/calendar/weeks/${weekNumber(week)}`,
  weekStats: (week: number) => `/api/calendar/weeks/${weekNumber(week)}/stats`,
  playersCatalog: () => "/api/players",
  playerLeague: (playerId: string, leagueId: string) =>
    `/api/players/${segment(playerId)}/league/${segment(leagueId)}`,
  market: (leagueId: string) => `/api/market/leagues/${segment(leagueId)}`,
  playerTeamOffers: (leagueId: string, playerTeamId: string) =>
    `/api/market/leagues/${segment(leagueId)}/player-teams/${segment(playerTeamId)}/offers`,
  marketOfferResponse: (
    leagueId: string, marketId: string, offerId: string, action: "accept" | "reject",
  ) => `/api/market/leagues/${segment(leagueId)}/${segment(marketId)}/offers/${segment(offerId)}/${action}`,
  playerMarketValue: (playerId: string) =>
    `/api/players/${segment(playerId)}/market-value`,
  playerStatsDetail: (playerId: string, query?: PlayerStatsDetailQuery) => {
    const base = `/api/players/${segment(playerId)}/stats/detail`;
    if (!query) return base;
    const checkedQuery = playerStatsDetailQuerySchema.parse(query);
    const params = new URLSearchParams();
    if (checkedQuery.last != null) params.set("last", String(checkedQuery.last));
    for (const competition of checkedQuery.competition ?? []) {
      params.append("competition", competition);
    }
    if (checkedQuery.limit != null) params.set("limit", String(checkedQuery.limit));
    if (checkedQuery.preset) params.set("preset", checkedQuery.preset);
    if (checkedQuery.from) params.set("from", checkedQuery.from);
    if (checkedQuery.to) params.set("to", checkedQuery.to);
    if (checkedQuery.includeWeather != null) {
      params.set("include_weather", checkedQuery.includeWeather ? "true" : "false");
    }
    if (checkedQuery.includeStats != null) {
      params.set("include_stats", checkedQuery.includeStats ? "true" : "false");
    }
    for (const include of checkedQuery.include ?? []) params.append("include", include);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  },
  leagueTeams: (leagueId: string) => `/api/leagues/${segment(leagueId)}/teams`,
  team: (leagueId: string, teamId: string) =>
    `/api/leagues/${segment(leagueId)}/teams/${segment(teamId)}`,
  lineup: (teamId: string) => `/api/teams/${segment(teamId)}/lineup`,
  lineupWeek: (teamId: string, week: number) =>
    `/api/teams/${segment(teamId)}/lineup/week/${weekNumber(week)}`,
  teamMoney: (teamId: string) => `/api/teams/${segment(teamId)}/money`,
  marketDirectOffer: (leagueId: string) =>
    `/api/market/leagues/${segment(leagueId)}/direct-offers`,
  marketBid: (leagueId: string, marketId: string) =>
    `/api/market/leagues/${segment(leagueId)}/${segment(marketId)}/bids`,
  marketBidUpdate: (leagueId: string, marketId: string, bidId: string) =>
    `/api/market/leagues/${segment(leagueId)}/${segment(marketId)}/bids/${segment(bidId)}`,
  marketListing: (leagueId: string, marketId: string) =>
    `/api/market/leagues/${segment(leagueId)}/${segment(marketId)}`,
  marketListings: (leagueId: string) =>
    `/api/market/leagues/${segment(leagueId)}/listings`,
  marketImmediateSale: (leagueId: string) =>
    `/api/market/leagues/${segment(leagueId)}/immediate-sales`,
  buyoutPay: (leagueId: string, playerTeamId: string) =>
    `/api/buyout/leagues/${segment(leagueId)}/player-teams/${segment(playerTeamId)}/pay`,
};

export type PutJsonOptions = GetJsonOptions;
export type PostJsonOptions = GetJsonOptions;

type SendJsonOptions = GetJsonOptions & { method: "PUT" | "POST" };

async function sendJson(
  path: string,
  token: string,
  body: unknown,
  options: SendJsonOptions,
): Promise<ApiResponseDto> {
  validateEndpointInput(options.method, path);
  const responseSchema = endpointResponseSchema(options.method, path);
  const bodySchema = endpointRequestSchema(options.method, path);
  if (!bodySchema && body !== undefined) {
    throw new Error(`This endpoint does not accept a request body: ${options.method} ${path}`);
  }
  const checkedBody = bodySchema ? serializeEndpointRequest(options.method, path, body) : undefined;
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(path, {
    method: options.method,
    credentials: "omit",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: checkedBody === undefined ? undefined : JSON.stringify(checkedBody),
    signal: options.signal,
  });
  if (!response.ok) await throwForStatus(response);
  return parseResponse(response, responseSchema);
}

export function getJson(
  path: ReturnType<typeof paths.competitionStandings>,
  token: string,
  options?: GetJsonOptions,
): Promise<CompetitionStandingsDto>;
export function getJson(
  path: string,
  token: string,
  options?: GetJsonOptions,
): Promise<ApiResponseDto>;
export async function getJson(
  path: string,
  token: string,
  options: GetJsonOptions = {},
): Promise<ApiResponseDto> {
  validateEndpointInput("GET", path);
  const responseSchema = endpointResponseSchema("GET", path);
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(path, {
    credentials: "omit",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: options.signal,
  });
  if (!response.ok) await throwForStatus(response);
  return parseResponse(response, responseSchema);
}

export async function putJson(
  path: string,
  token: string,
  body: unknown,
  options: PutJsonOptions = {},
): Promise<ApiResponseDto> {
  return sendJson(path, token, body, { ...options, method: "PUT" });
}

export async function postJson(
  path: string,
  token: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<ApiResponseDto> {
  return sendJson(path, token, body, { ...options, method: "POST" });
}

export async function deleteJson(
  path: string,
  token: string,
  options: GetJsonOptions = {},
): Promise<ApiResponseDto> {
  validateEndpointInput("DELETE", path);
  const responseSchema = endpointResponseSchema("DELETE", path);
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(path, {
    method: "DELETE",
    credentials: "omit",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: options.signal,
  });
  if (!response.ok) await throwForStatus(response);
  return parseResponse(response, responseSchema);
}

async function throwForStatus(response: Response): Promise<never> {
  let code = "request_failed";
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    if (parsed.success && typeof parsed.data.error === "string") code = parsed.data.error;
  } catch {
    code = "request_failed";
  }
  if (response.status === 401 && code === "needs_reauth") throw new NeedsReauthError();
  throw new ApiError(response.status, code);
}

async function parseResponse(
  response: Response, schema: ReturnType<typeof endpointResponseSchema>,
): Promise<ApiResponseDto> {
  try {
    return schema.parse(await response.json());
  } catch {
    throw new ApiContractError();
  }
}
