// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import { ApiError } from "../../api/errors";
import {
  LINEUP_NOT_SET_MESSAGE,
  PAST_FIXTURE_LOCKED_MESSAGE,
  lineupLoadMessage,
} from "./lineupMessages";

// ---- Happy path ---- //

describe("lineupLoadMessage", () => {
  it("lineupLoadMessage_maps_404_to_not_set_copy", () => {
    expect(lineupLoadMessage(new ApiError(404, "not_found"))).toBe(LINEUP_NOT_SET_MESSAGE);
  });

  it("lineupLoadMessage_keeps_generic_message_for_other_errors", () => {
    expect(lineupLoadMessage(new ApiError(502, "fantasy_error"))).toBe(
      "This lineup could not be loaded.",
    );
  });
});

describe("past fixture copy", () => {
  it("past_fixture_locked_message_explains_played_lineup", () => {
    expect(PAST_FIXTURE_LOCKED_MESSAGE).toBe(
      "You cannot change players for fixtures that have already been played.",
    );
  });
});
