import { ApiError, NeedsReauthError } from "../../../api/errors";

export const BID_STATE_CONFLICT_MESSAGE =
  "There have been many changes to the player's purchase status. Please refresh the page and try again";

export type MarketActionKind = "bid" | "clause" | "withdraw";

/** Maps a failed market mutation to a user-facing message. */
export function marketActionErrorMessage(
  error: unknown,
  kind: MarketActionKind = "bid",
): string {
  if (error instanceof NeedsReauthError) {
    return "Your LaLiga session expired. Link your account again.";
  }
  if (error instanceof ApiError) {
    if (kind === "withdraw" && error.code !== "fantasy_unauthorized") {
      return "The player could not be withdrawn from the market.";
    }
    if (kind === "bid" && error.status === 400 && error.code === "fantasy_error") {
      return BID_STATE_CONFLICT_MESSAGE;
    }
    if (error.status === 403) {
      return "LaLiga rejected this action (forbidden). Check your balance, the listing type, and that bidding is allowed in this league.";
    }
    if (error.code === "fantasy_error" && error.status === 403) {
      return "LaLiga rejected this bid. A negative balance or the wrong offer type can cause this.";
    }
    if (error.code === "fantasy_unauthorized") {
      return "LaLiga rejected your session. Link your account again.";
    }
  }
  return "The action could not be completed.";
}
