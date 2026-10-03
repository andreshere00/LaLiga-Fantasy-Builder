import { ApiError, NeedsReauthError } from "../../api/errors";

export const LINEUP_NOT_SET_MESSAGE =
  "The player has not set a lineup for this fixture yet";

export const PAST_FIXTURE_LOCKED_MESSAGE =
  "You cannot change players for fixtures that have already been played.";

export const SAVE_NO_CHANGES_MESSAGE = "No changes detected from last lineup";

const UNPLAYED_FIXTURE_SCORE_PREFIX = "This fixture has not been played yet.";

/** Hover copy for a player score badge on the open matchweek. */
export function unplayedFixtureScoreTooltip(countdown: string): string {
  return `${UNPLAYED_FIXTURE_SCORE_PREFIX} Next match starts in: ${countdown}.`;
}

/** Fallback when kickoff time is not available yet. */
export function unplayedFixtureScoreTooltipFallback(): string {
  return UNPLAYED_FIXTURE_SCORE_PREFIX;
}

const OPPONENT_LINEUP_UNAVAILABLE_PREFIX =
  "Lineup not available for matches that have not yet been played.";

/** Modal copy when peeking an opponent lineup on the open matchweek. */
export function opponentLineupUnavailableMessage(countdown: string): string {
  return `${OPPONENT_LINEUP_UNAVAILABLE_PREFIX} Next match: ${countdown}.`;
}

export function opponentLineupUnavailableMessageFallback(): string {
  return OPPONENT_LINEUP_UNAVAILABLE_PREFIX;
}

const LINEUP_LOAD_FAILED_MESSAGE = "This lineup could not be loaded.";

/** User-facing copy for lineup fetch failures (404 → not set yet). */
export function lineupLoadMessage(error: unknown): string | null {
  if (!error || error instanceof NeedsReauthError) return null;
  if (error instanceof ApiError && error.status === 404) {
    return LINEUP_NOT_SET_MESSAGE;
  }
  return LINEUP_LOAD_FAILED_MESSAGE;
}
