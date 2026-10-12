// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it, vi } from "vitest";

import { getJson, paths, postJson, putJson } from "./client";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---- Happy path ---- //

describe("getJson", () => {
  it("getJson_passes_abort_signal_to_fetch", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return json([]);
    });

    await getJson("/api/leagues", "token-1", { fetchFn, signal: controller.signal });

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("getJson_invalid_response_fails_schema_validation", async () => {
    const fetchFn = vi.fn(async () => json({ unrelated: true }));

    await expect(getJson(paths.currentWeek(), "token-1", { fetchFn })).rejects.toThrow();
  });

  it("getJson_maps_declared_nested_wire_aliases_only", async () => {
    const fetchFn = vi.fn(async () =>
      json([
        {
          id: "league-1",
          team: {
            manager: { manager_name: "Alex", profile_image: "avatar.png" },
          },
        },
      ]),
    );

    const result = await getJson(paths.leagues(), "token-1", { fetchFn });
    const league = (result as Array<{ team: { manager: Record<string, unknown> } }>)[0];
    expect(league.team.manager.managerName).toBe("Alex");
    expect(league.team.manager.profileImage).toBe("avatar.png");
  });

  it("getJson_preserves_dynamic_dictionary_keys", async () => {
    const fetchFn = vi.fn(async () =>
      json({
        formation: {
          goalkeeper: ["entry-1"],
          defender: [],
          midfield: [],
          striker: [],
          bench: { "striker_2": { "player_id": "entry-2" } },
        },
      }),
    );

    const result = await getJson("/api/teams/team-1/lineup", "token-1", { fetchFn });
    const lineup = result as {
      formation: { bench: Record<string, unknown> };
    };
    expect(lineup.formation.bench).toHaveProperty("striker_2");
    expect(lineup.formation.bench).not.toHaveProperty("striker2");
  });
});

describe("postJson", () => {
  it("postJson_sends_post_with_json_body", async () => {
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ money: 120 }));
      return json({ ok: true });
    });

    await postJson("/api/market/leagues/l1/m1/bids", "token-1", { money: 120 }, { fetchFn });

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("postJson_invalid_body_is_rejected_before_fetch", async () => {
    const fetchFn = vi.fn(async () => json({ ok: true }));

    await expect(
      postJson("/api/market/leagues/l1/m1/bids", "token-1", { money: 0 }, { fetchFn }),
    ).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("postJson_rejects_snake_case_request_dto_before_fetch", async () => {
    const fetchFn = vi.fn(async () => json({ ok: true }));

    await expect(
      postJson("/api/market/leagues/l1/m1/bids", "token-1", { offer_money: 10 }, { fetchFn }),
    ).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("putJson", () => {
  it("putJson_sends_put_with_json_body", async () => {
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      expect(init?.body).toBe(
        JSON.stringify({
          goalkeeper: "pt-1",
          defender: [],
          midfield: [],
          striker: [],
          tactical_formation: [],
        }),
      );
      return json({});
    });

    await putJson(
      "/api/teams/t1/lineup",
      "token-1",
      {
        goalkeeper: "pt-1",
        defender: [],
        midfield: [],
        striker: [],
        tacticalFormation: [],
      },
      { fetchFn },
    );

    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
