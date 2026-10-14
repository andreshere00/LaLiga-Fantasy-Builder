// ---- Mocks, fixtures & helpers ---- //
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getJson, paths } from "./client";
import { competitionStandingsSchema } from "./schemas";

const payload = JSON.parse(readFileSync(resolve(process.cwd(), "../contracts/standings-response.json"), "utf8")).payload;

// ---- Happy path ---- //
describe("real-club standings transport", () => {
  it("schema_fixture_source_accepts_computed_standings", () => {
    const computed = structuredClone(payload);
    computed.source = "laliga-fixtures";
    for (const row of computed.rows) {
      for (const match of row.last5Matches) {
        match.matchId = match.matchId.replace("api-football:", "laliga-fantasy:");
      }
    }
    expect(competitionStandingsSchema.parse(computed)).toEqual(computed);
  });
  it("getJson_completed_standings_returns_shared_python_contract", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const response = await getJson(paths.competitionStandings(1, 2026), "app-jwt", { fetchFn });
    expect(response).toEqual(payload);
    expect(fetchFn).toHaveBeenCalledWith("/api/competitions/1/standings?mode=completed&season=2026", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer app-jwt" }),
    }));
  });
  // ---- Error paths ---- //
  it.each(["totals", "form", "duplicate_club", "missing_time", "bad_result", "alias"])("schema_%s_rejects_malformed_shared_contract", (change) => {
    const malformed = structuredClone(payload);
    if (change === "totals") malformed.rows[0].played += 1;
    else if (change === "form") malformed.rows[0].last5Matches.pop();
    else if (change === "duplicate_club") malformed.rows[1].team = malformed.rows[0].team;
    else if (change === "missing_time") delete malformed.fetchedAt;
    else if (change === "bad_result") malformed.rows[0].last5Matches[0].result = "L";
    else malformed.fetched_at = malformed.fetchedAt;
    expect(competitionStandingsSchema.safeParse(malformed).success).toBe(false);
  });
  // ---- Edge cases ---- //
  it.each(["season=1999", "mode=unknown", "extra=value"])("getJson_invalid_query_%s_rejects_before_fetch", async (query) => {
    const fetchFn = vi.fn();
    await expect(getJson(`/api/competitions/1/standings?${query}`, "app-jwt", { fetchFn })).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
