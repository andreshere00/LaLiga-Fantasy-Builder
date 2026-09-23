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
  team: (leagueId: string, teamId: string) =>
    `/api/leagues/${segment(leagueId)}/teams/${segment(teamId)}`,
  lineup: (teamId: string) => `/api/teams/${segment(teamId)}/lineup`,
};

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
