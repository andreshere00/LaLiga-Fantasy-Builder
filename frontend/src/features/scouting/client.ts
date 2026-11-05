import { z } from "zod";
import { throwForStatus } from "../../api/client";
import { serializeEndpointRequest, validateEndpointInput } from "../../api/schemas";
import { ApiContractError } from "../../api/errors";

export { favoritesSchema, inboxSchema, resultSchema, watchSchema } from "../../api/scouting";
export type { Favorite, Watch } from "../../api/scouting";
const playerId = z.string().regex(/^[0-9]{1,10}$/);
const identifier = z.string().min(1).max(128).regex(/^[^/\s?#]+$/);
export const scoutingPaths = {
  favorites: (league?: string) => "/api/scouting/favorites" + (league ? `?league_id=${encodeURIComponent(identifier.parse(league))}` : ""),
  favorite: (player: string) => `/api/scouting/favorites/${playerId.parse(player)}`,
  import: "/api/scouting/favorites/import",
  watch: (league: string, player: string) => `/api/scouting/leagues/${encodeURIComponent(identifier.parse(league))}/watches/${playerId.parse(player)}`,
  refresh: (league: string) => `/api/scouting/leagues/${encodeURIComponent(identifier.parse(league))}/refresh`,
  inbox: (cursor?: string) => "/api/scouting/notifications" + (cursor ? `?cursor=${z.string().regex(/^[0-9]+$/).parse(cursor)}` : ""),
  read: (id: string) => `/api/scouting/notifications/${z.string().regex(/^[0-9]+$/).parse(id)}/read`,
};

/** Dedicated domain contracts; every response is validated before entering the query cache. */
export async function scoutingRequest<T>(
  token: string, path: string, schema: z.ZodType<T>, method = "GET", body?: unknown, signal?: AbortSignal,
): Promise<T> {
  validateEndpointInput(method, path);
  const checkedBody = body === undefined ? undefined : serializeEndpointRequest(method, path, body);
  const response = await fetch(path, {
    method, credentials: "omit", signal,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: checkedBody === undefined ? undefined : JSON.stringify(checkedBody),
  });
  if (!response.ok) await throwForStatus(response);
  try { return schema.parse(await response.json()); }
  catch { throw new ApiContractError(); }
}
