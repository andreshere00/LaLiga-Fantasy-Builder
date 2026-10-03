import { ApiError, NeedsReauthError } from "./errors";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GetJsonOptions = {
  fetchFn?: FetchLike;
  signal?: AbortSignal;
};

function segment(value: string): string {
  return encodeURIComponent(value);
}

export const paths = {
  leagues: () => "/api/leagues",
  standing: (leagueId: string) => `/api/leagues/${segment(leagueId)}/standing`,
  weekStanding: (leagueId: string, week: number) =>
    `/api/leagues/${segment(leagueId)}/standing/${week}`,
  currentWeek: () => "/api/calendar/current",
  weekStats: (week: number) => `/api/calendar/weeks/${week}/stats`,
  playersCatalog: () => "/api/players",
  market: (leagueId: string) => `/api/market/leagues/${segment(leagueId)}`,
  playerMarketValue: (playerId: string) =>
    `/api/players/${segment(playerId)}/market-value`,
  leagueTeams: (leagueId: string) => `/api/leagues/${segment(leagueId)}/teams`,
  team: (leagueId: string, teamId: string) =>
    `/api/leagues/${segment(leagueId)}/teams/${segment(teamId)}`,
  lineup: (teamId: string) => `/api/teams/${segment(teamId)}/lineup`,
  lineupWeek: (teamId: string, week: number) =>
    `/api/teams/${segment(teamId)}/lineup/week/${week}`,
  teamMoney: (teamId: string) => `/api/teams/${segment(teamId)}/money`,
  marketDirectOffer: (leagueId: string) =>
    `/api/market/leagues/${segment(leagueId)}/direct-offers`,
  marketBid: (leagueId: string, marketId: string) =>
    `/api/market/leagues/${segment(leagueId)}/${segment(marketId)}/bids`,
  marketBidUpdate: (leagueId: string, marketId: string, bidId: string) =>
    `/api/market/leagues/${segment(leagueId)}/${segment(marketId)}/bids/${segment(bidId)}`,
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
): Promise<unknown> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(path, {
    method: options.method,
    credentials: "omit",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) await throwForStatus(response);
  return response.json() as Promise<unknown>;
}

export async function getJson(
  path: string,
  token: string,
  options: GetJsonOptions = {},
): Promise<unknown> {
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
  return response.json() as Promise<unknown>;
}

export async function putJson(
  path: string,
  token: string,
  body: unknown,
  options: PutJsonOptions = {},
): Promise<unknown> {
  return sendJson(path, token, body, { ...options, method: "PUT" });
}

export async function postJson(
  path: string,
  token: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<unknown> {
  return sendJson(path, token, body, { ...options, method: "POST" });
}

export async function deleteJson(
  path: string,
  token: string,
  options: GetJsonOptions = {},
): Promise<unknown> {
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
  return response.json() as Promise<unknown>;
}

async function throwForStatus(response: Response): Promise<never> {
  let code = "request_failed";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") code = body.error;
  } catch {
    code = "request_failed";
  }
  if (response.status === 401 && code === "needs_reauth") throw new NeedsReauthError();
  throw new ApiError(response.status, code);
}
