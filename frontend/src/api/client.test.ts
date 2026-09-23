// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it, vi } from "vitest";

import { getJson } from "./client";

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
      return json({ ok: true });
    });

    await getJson("/api/leagues", "token-1", { fetchFn, signal: controller.signal });

    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
