import { paths, throwForStatus, type GetJsonOptions } from "./client";
import { ApiContractError, ApiError } from "./errors";
import {
  lineupBuildStreamEventSchema, serializeEndpointRequest, validateEndpointInput,
  type LineupBuildDto, type LineupBuildProgress, type LineupBuildRequest,
} from "./schemas";

/** Consume authenticated JSON lines without buffering the complete build response. */
export async function streamLineupBuild(
  leagueId: string, token: string, preferences: LineupBuildRequest,
  onProgress: (progress: LineupBuildProgress) => void,
  options: GetJsonOptions = {},
): Promise<LineupBuildDto> {
  const path = paths.lineupBuildStream(leagueId);
  validateEndpointInput("POST", path);
  const response = await (options.fetchFn ?? fetch)(path, {
    method: "POST", credentials: "omit", signal: options.signal,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/x-ndjson",
      "Content-Type": "application/json" },
    body: JSON.stringify(serializeEndpointRequest("POST", path, preferences)),
  });
  if (!response.ok) await throwForStatus(response);
  if (response.headers.get("Content-Type")?.split(";")[0] !== "application/x-ndjson"
    || !response.body) throw new ApiContractError();

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  function consume(line: string): LineupBuildDto | undefined {
    let event;
    try {
      event = lineupBuildStreamEventSchema.parse(JSON.parse(line));
    } catch {
      throw new ApiContractError();
    }
    if (event.type === "error") throw new ApiError(event.status, event.error, event.diagnostics);
    if (event.type === "result") return event.result;
    onProgress(event.progress);
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      options.signal?.throwIfAborted();
      try {
        buffer += decoder.decode(value, { stream: !done });
      } catch {
        throw new ApiContractError();
      }
      // Bound a malformed/unterminated event without limiting a whole build stream.
      if (buffer.length > 8 * 1024 * 1024) throw new ApiContractError();
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const result = consume(line);
        if (result) return result;
      }
      if (done) {
        if (buffer.trim()) {
          const result = consume(buffer);
          if (result) return result;
        }
        throw new ApiContractError();
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
