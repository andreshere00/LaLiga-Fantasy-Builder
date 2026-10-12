// ---- Mocks, fixtures & helpers ---- //
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { deleteJson, getJson, paths, postJson } from "./client";
import { ApiContractError } from "./errors";
import { endpointRequestSchema, endpointResponseSchema, playerStatsDetailQuerySchema } from "./schemas";

type Case = { name: string; kind: string; path: string; method: string; payload: unknown; serialized?: unknown; valid: boolean };
const cases = JSON.parse(readFileSync(resolve(process.cwd(), "../contracts/schema-validation-fixtures.json"), "utf8")) as Case[];

// ---- Happy path ---- //
describe("shared Python and Zod contract fixtures", () => {
  it.each(cases)("$name", (testCase) => {
    const schema = testCase.kind === "query" ? playerStatsDetailQuerySchema
      : testCase.kind === "request" ? endpointRequestSchema(testCase.method, testCase.path)!
      : endpointResponseSchema(testCase.method, testCase.path);
    expect(schema.safeParse(testCase.payload).success).toBe(testCase.valid);
    if (testCase.serialized !== undefined) expect(schema.safeParse(testCase.serialized).success).toBe(true);
  });
  it("serializes supported include segments", () => {
    expect(paths.playerStatsDetail("7", { include: ["market"] })).toContain("include=market");
  });
});
// ---- Error paths ---- //
describe("transport validation", () => {
  it.each([
    "/api/players/7/stats/detail?limit=6", "/api/players/7/stats/detail?to=2026-01-01",
    "/api/players/7/stats/detail?unknown=x", "/api/players/7/stats/fixtures?last=61",
    "/api/players/7/stats/market?from=2026-01-02&to=2026-01-01",
    "/api/players/7/stats/matches/recent?include_stats=broken",
    "/api/players/7/stats/matches/upcoming?limit=6", "/api/calendar/weeks/0", "/api/calendar/weeks/0/stats",
    "/api/unknown", "/api/teams/../lineup",
  ])("rejects %s before fetch", async (path) => {
    const fetchFn = vi.fn();
    await expect(getJson(path, "token", { fetchFn })).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each(["true", "TRUE", "1", "yes", "false", "0", "off"])("accepts Python-supported boolean query %s", async (value) => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(getJson(`/api/players/7/stats/matches/recent?include_stats=${value}`, "token", { fetchFn })).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("rejects unregistered DELETE before fetch", async () => {
    const fetchFn = vi.fn();
    await expect(deleteJson("/api/unknown", "token", { fetchFn })).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each(["{", '{"unrelated":"private provider data"}'])("sanitizes invalid successful responses", async (body) => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    await expect(postJson(paths.marketListings("lg"), "token", { playerId: "pt", salePrice: 1 }, { fetchFn }))
      .rejects.toEqual(new ApiContractError());
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
