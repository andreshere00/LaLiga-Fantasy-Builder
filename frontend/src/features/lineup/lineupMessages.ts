import { ApiError, NeedsReauthError } from "../../api/errors";

export const LINEUP_NOT_SET_MESSAGE =
  "The player has not set a lineup for this fixture yet";

const LINEUP_LOAD_FAILED_MESSAGE = "This lineup could not be loaded.";

/** User-facing copy for lineup fetch failures (404 → not set yet). */
export function lineupLoadMessage(error: unknown): string | null {
  if (!error || error instanceof NeedsReauthError) return null;
  if (error instanceof ApiError && error.status === 404) {
    return LINEUP_NOT_SET_MESSAGE;
  }
  return LINEUP_LOAD_FAILED_MESSAGE;
}
