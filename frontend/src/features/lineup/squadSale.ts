import { ApiError, NeedsReauthError } from "../../api/errors";

/** Highest whole-euro listing price Fantasy Builder accepts. */
export const MAX_LISTING_PRICE = 999_999_999;

export const LISTING_PRICE_STEP = 1_000;

/** Lowest whole-euro offer that is still at least the current market value. */
export function minimumListingPrice(marketValue: number | null): number | null {
  if (marketValue == null || !Number.isFinite(marketValue) || marketValue <= 0) return null;
  const minimum = Math.ceil(marketValue);
  if (minimum > MAX_LISTING_PRICE) return null;
  return minimum;
}

/** Half the current market value, as whole euros credited on an immediate sale. */
export function immediateSalePrice(marketValue: number | null): number | null {
  const minimum = minimumListingPrice(marketValue);
  if (minimum == null) return null;
  const half = Math.floor(minimum / 2);
  return half >= 1 ? half : null;
}

/** True when ``price`` is a whole euro amount in the allowed listing range. */
export function isValidListingPrice(price: number | null, marketValue: number | null): boolean {
  const minimum = minimumListingPrice(marketValue);
  if (price == null || minimum == null || !Number.isInteger(price)) return false;
  return price >= minimum && price <= MAX_LISTING_PRICE;
}

export function clampListingPrice(price: number, marketValue: number | null): number {
  const minimum = minimumListingPrice(marketValue) ?? 1;
  return Math.min(MAX_LISTING_PRICE, Math.max(minimum, price));
}

export type SquadSaleKind = "list" | "immediate" | "cancel" | "modify";

/** The old listing was removed and the replacement offer was rejected. */
export class ListingReplaceError extends Error {
  constructor() {
    super("The previous offer was cancelled, but the new offer could not be saved.");
    this.name = "ListingReplaceError";
  }
}

/** Maps a failed squad sale to a user-facing message. */
export function squadSaleErrorMessage(error: unknown, kind: SquadSaleKind): string {
  if (error instanceof ListingReplaceError) return error.message;
  if (error instanceof NeedsReauthError) {
    return "Your LaLiga session expired. Link your account again.";
  }
  if (error instanceof ApiError && error.code === "fantasy_unauthorized") {
    return "LaLiga rejected your session. Link your account again.";
  }
  if (kind === "list" || kind === "modify") return "The offer could not be saved.";
  if (kind === "cancel") return "The offer could not be cancelled.";
  return "The player could not be sold immediately.";
}
