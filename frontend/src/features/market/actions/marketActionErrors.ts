import { ApiError, NeedsReauthError } from "../../../api/errors";

export function marketActionErrorMessage(error: unknown): string {
  if (error instanceof NeedsReauthError) {
    return "Your LaLiga session expired. Link your account again.";
  }
  if (error instanceof ApiError) {
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
