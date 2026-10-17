import { describe, expect, it, vi } from "vitest";
import response from "../../../contracts/lineup-builder-response.json";
import { ApiContractError, ApiError } from "./errors";
import { streamLineupBuild } from "./lineupBuild";
import type { LineupBuildRequest } from "./schemas";

const preferences: LineupBuildRequest = {
  sources: ["owned"], mandatoryPlayerIds: [], formations: [], allowBuying: false,
  allowSelling: false, includeTradingPurchases: false, maxCandidates: 5,
  explanation: { enabled: false },
};
const progress = { type: "progress", progress: {
  stage: "players", percent: 47, completed_players: 5, total_players: 10,
} };

function streamed(chunks: string[], cancel = vi.fn()) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }, cancel,
  }), { headers: { "Content-Type": "application/x-ndjson" } });
}

describe("streamLineupBuild", () => {
  it("reports progress before the final result arrives across arbitrary chunk boundaries", async () => {
    const onProgress = vi.fn();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const fetchFn = vi.fn(async () => new Response(body, {
      headers: { "Content-Type": "application/x-ndjson" },
    }));
    const controllerSignal = new AbortController();
    const result = streamLineupBuild("l/1", "jwt", preferences, onProgress, {
      fetchFn, signal: controllerSignal.signal,
    });
    const line = JSON.stringify(progress) + "\n";
    controller.enqueue(encoder.encode(line.slice(0, 25)));
    controller.enqueue(encoder.encode(line.slice(25)));
    await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith({
      stage: "players", percent: 47, completedPlayers: 5, totalPlayers: 10,
    }));
    controller.enqueue(encoder.encode(JSON.stringify({ type: "result", result: response.payload })));
    controller.close();
    expect((await result).buildId).toBe("fixture");
    expect(fetchFn).toHaveBeenCalledWith("/api/lineup-builder/leagues/l%2F1/build/stream", {
      method: "POST", credentials: "omit", signal: controllerSignal.signal,
      headers: { Authorization: "Bearer jwt", Accept: "application/x-ndjson", "Content-Type": "application/json" },
      body: JSON.stringify({ sources: ["owned"], mandatory_player_ids: [], formations: [],
        allow_buying: false, allow_selling: false, include_trading_purchases: false,
        max_candidates: 5, explanation: { enabled: false } }),
    });
  });

  it("maps terminal error events and diagnostic aliases to API errors", async () => {
    const fetchFn = vi.fn(async () => streamed([JSON.stringify({ type: "error", status: 503,
      error: "standings_unavailable", diagnostics: [{ code: "standings_unavailable", player_id: null }],
    }) + "\n"]));
    await expect(streamLineupBuild("l1", "jwt", preferences, vi.fn(), { fetchFn }))
      .rejects.toMatchObject({ status: 503, code: "standings_unavailable",
        diagnostics: [{ code: "standings_unavailable", playerId: null }] });
  });

  it.each(["not-json\n", JSON.stringify(progress) + "\n", '{"type":"result","result":{}}\n',
    '{"type":"progress","progress":{"percent":101}}\n', ""])
  ("rejects malformed or truncated streams: %s", async (body) => {
    const fetchFn = vi.fn(async () => streamed([body]));
    await expect(streamLineupBuild("l1", "jwt", preferences, vi.fn(), { fetchFn }))
      .rejects.toBeInstanceOf(ApiContractError);
  });

  it("handles authentication failure before a stream starts", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized", detail: "" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    }));
    await expect(streamLineupBuild("l1", "jwt", preferences, vi.fn(), { fetchFn }))
      .rejects.toBeInstanceOf(ApiError);
  });

  it("cancels the reader after a terminal event without waiting for EOF", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "result", result: response.payload }) + "\n"));
    }, cancel });
    const fetchFn = vi.fn(async () => new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }));
    await streamLineupBuild("l1", "jwt", preferences, vi.fn(), { fetchFn });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
