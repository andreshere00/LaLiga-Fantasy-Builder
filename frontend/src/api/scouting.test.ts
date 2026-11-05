import { describe, expect, it, vi } from "vitest";
import { favoritesImportSchema, watchSchema } from "./scouting";
import { endpointResponseSchema, serializeEndpointRequest, validateEndpointInput } from "./schemas";
import { scoutingPaths, scoutingRequest, favoritesSchema } from "../features/scouting/client";

describe("scouting contracts", () => {
  it("rejects owner overrides, unsupported lead times and malformed master IDs", () => {
    expect(() => watchSchema.parse({ marketAlert: true, clauseAlert: true, leadHours: 2 })).toThrow();
    expect(() => favoritesImportSchema.parse({ playerIds: ["7"], userId: "other" })).toThrow();
    expect(() => scoutingPaths.favorite("../7")).toThrow();
    expect(() => scoutingPaths.watch("league/other", "7")).toThrow();
  });
  it("registers strict writes and paginated inbox queries", () => {
    expect(serializeEndpointRequest("PUT", scoutingPaths.watch("l1", "7"), {
      marketAlert: true, clauseAlert: false, leadHours: 6,
    })).toEqual({ marketAlert: true, clauseAlert: false, leadHours: 6 });
    expect(() => validateEndpointInput("GET", scoutingPaths.inbox("12"))).not.toThrow();
    expect(() => validateEndpointInput("GET", "/api/scouting/notifications?cursor=0")).toThrow();
    expect(() => endpointResponseSchema("GET", scoutingPaths.favorites()).parse({})).toThrow();
  });
  it("sends only the application bearer and rejects malformed successful responses", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ favorites: "unexpected" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(scoutingRequest("app-token", scoutingPaths.favorites("l1"), favoritesSchema)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledWith("/api/scouting/favorites?league_id=l1", expect.objectContaining({
        credentials: "omit", headers: expect.objectContaining({ Authorization: "Bearer app-token" }),
      }));
    } finally { vi.unstubAllGlobals(); }
  });
});
