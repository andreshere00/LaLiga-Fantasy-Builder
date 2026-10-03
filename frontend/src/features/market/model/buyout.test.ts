import { describe, expect, it } from "vitest";

import { parseInstant } from "../../../api/mappers";
import { buyoutClauseUnlockAt, buyoutUnlockByPlayerTeamId } from "./buyout";

describe("parseInstant", () => {
  it("parseInstant_accepts_epoch_seconds", () => {
    expect(parseInstant(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("parseInstant_accepts_iso_string", () => {
    expect(parseInstant("2026-10-05T12:00:00Z")).toBe(Date.parse("2026-10-05T12:00:00Z"));
  });
});

describe("buyoutClauseUnlockAt", () => {
  it("buyoutClauseUnlockAt_reads_numeric_lock_end_time", () => {
    const unlock = buyoutClauseUnlockAt({ buyoutClauseLockedEndTime: 1_800_000_000_000 });
    expect(unlock).toBe(1_800_000_000_000);
  });
});

describe("buyoutUnlockByPlayerTeamId", () => {
  it("buyoutUnlockByPlayerTeamId_indexes_roster_entries", () => {
    const map = buyoutUnlockByPlayerTeamId([
      {
        players: [
          {
            playerTeamId: "pt-9",
            buyoutClauseLockedEndTime: "2026-12-01T00:00:00Z",
          },
        ],
      },
    ]);
    expect(map.get("pt-9")).toBe(Date.parse("2026-12-01T00:00:00Z"));
  });
});
