import { describe, expect, it } from "vitest";

import { ApiError } from "../../../api/errors";
import { BID_STATE_CONFLICT_MESSAGE, marketActionErrorMessage } from "./marketActionErrors";

// ---- Happy path ---- #

describe("marketActionErrorMessage", () => {
  it("marketActionErrorMessage_bid_400_fantasy_error_returns_state_conflict", () => {
    const error = new ApiError(400, "fantasy_error");
    expect(marketActionErrorMessage(error, "bid")).toBe(BID_STATE_CONFLICT_MESSAGE);
  });

  it("marketActionErrorMessage_withdraw_403_returns_withdraw_copy", () => {
    expect(marketActionErrorMessage(new ApiError(403, "fantasy_error"), "withdraw")).toBe(
      "The player could not be withdrawn from the market.",
    );
  });

  // ---- Edge cases ---- #

  it("marketActionErrorMessage_clause_400_fantasy_error_returns_generic", () => {
    const error = new ApiError(400, "fantasy_error");
    expect(marketActionErrorMessage(error, "clause")).toBe("The action could not be completed.");
  });

  it("marketActionErrorMessage_local_missing_bid_returns_generic", () => {
    expect(marketActionErrorMessage(new ApiError(400, "missing_bid"), "bid")).toBe(
      "The action could not be completed.",
    );
  });
});
