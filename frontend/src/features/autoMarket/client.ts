import { z } from "zod";
import { scoutingRequest } from "../scouting/client";

const identifier = z.string().min(1).max(128).regex(/^[^/\s?#]+$/);
const ruleId = z.number().int().positive();

/** Validated, league-scoped paths; the transport already checks them against the registry. */
export const autoMarketPaths = {
  rules: (league: string) => `/api/auto-market/leagues/${encodeURIComponent(identifier.parse(league))}/rules`,
  rule: (league: string, id: number) =>
    `/api/auto-market/leagues/${encodeURIComponent(identifier.parse(league))}/rules/${ruleId.parse(id)}`,
};

/** Same authenticated, schema-checked transport as scouting; every response is validated. */
export const autoMarketRequest = scoutingRequest;
