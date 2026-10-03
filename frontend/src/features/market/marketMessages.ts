import { isCoachPosition } from "./positions";

export const MARKET_SEARCH_NO_MATCHES =
  "No market players match your search.";

/** Shown when a user tries to hire a coach from the market without premium. */
export const COACH_HIRE_PREMIUM_MESSAGE =
  "Hiring coaches is only available for LaLiga Fantasy premium subscribers";

/** Shown when a release clause cannot be paid yet (time lock). */
export const CLAUSE_BLOCKED_MESSAGE =
  "The player's release clause cannot be activated yet.";

export type MarketBidKind = "hire" | "purchase" | "modify";

/** True when the listing is a LaLiga coach hire action. */
export function isCoachMarketHire(
  positionId: number | null,
  kind: MarketBidKind,
): boolean {
  return kind === "hire" && isCoachPosition(positionId);
}
