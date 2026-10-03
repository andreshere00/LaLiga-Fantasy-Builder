// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import { ApiError } from "../../api/errors";
import {
  LINEUP_NOT_SET_MESSAGE,
  PAST_FIXTURE_LOCKED_MESSAGE,
  SAVE_NO_CHANGES_MESSAGE,
  lineupLoadMessage,
  opponentLineupUnavailableMessage,
  opponentLineupUnavailableMessageFallback,
  unplayedFixtureScoreTooltip,
  unplayedFixtureScoreTooltipFallback,
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

describe("save lineup copy", () => {
  it("save_no_changes_message_describes_unchanged_lineup", () => {
    expect(SAVE_NO_CHANGES_MESSAGE).toBe("No changes detected from last lineup");
  });
});

describe("opponent lineup unavailable", () => {
  it("opponentLineupUnavailableMessage_includes_next_match_countdown", () => {
    expect(opponentLineupUnavailableMessage("2 days 3 hours 5 minutes")).toBe(
      "Lineup not available for matches that have not yet been played. Next match: 2 days 3 hours 5 minutes.",
    );
  });

  it("opponentLineupUnavailableMessageFallback_omits_countdown", () => {
    expect(opponentLineupUnavailableMessageFallback()).toBe(
      "Lineup not available for matches that have not yet been played.",
    );
  });
});

describe("unplayed fixture score tooltip", () => {
  it("unplayedFixtureScoreTooltip_includes_countdown_phrase", () => {
    expect(unplayedFixtureScoreTooltip("2 days 3 hours 5 minutes")).toBe(
      "This fixture has not been played yet. Next match starts in: 2 days 3 hours 5 minutes.",
    );
  });

  it("unplayedFixtureScoreTooltipFallback_omits_countdown", () => {
    expect(unplayedFixtureScoreTooltipFallback()).toBe(
      "This fixture has not been played yet.",
    );
  });
});
