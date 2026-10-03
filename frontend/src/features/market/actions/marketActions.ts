import { COACH_HIRE_PREMIUM_MESSAGE, isCoachMarketHire } from "../marketMessages";
import { remainingMs } from "../model/valueSeries";
import type { MarketRow } from "../model/row";

export type BidActionKind = "hire" | "purchase" | "modify";

export type MarketAction =
  | { type: "bid"; kind: BidActionKind; label: string }
  | { type: "pay-clause"; label: string; amount: number };

export type MarketActionOffer =
  | {
      type: "bid";
      kind: BidActionKind;
      label: string;
      enabled: boolean;
      disabledReason?: string;
    }
  | {
      type: "cancel-bid";
      label: string;
      enabled: boolean;
      disabledReason?: string;
    }
  | {
      type: "pay-clause";
      label: string;
      amount: number;
      enabled: boolean;
      disabledReason?: string;
    };

export const MAX_SQUAD_PLAYERS = 24;
export const MAX_DEBT_RATIO_OF_SQUAD_VALUE = 0.2;

export type MarketActionContext = {
  money: number | null;
  now: number;
  callerTeamId: string | null;
  squadPlayerCount: number | null;
  activeBidCount: number | null;
  squadMarketValue: number | null;
};

function spendingPower(money: number, reservedBidMoney: number): number {
  return money + reservedBidMoney;
}

function maxAllowedDebt(squadMarketValue: number | null): number | null {
  if (squadMarketValue == null || squadMarketValue <= 0) return null;
  return squadMarketValue * MAX_DEBT_RATIO_OF_SQUAD_VALUE;
}

function debtAfterBid(spending: number, amount: number): number {
  const balanceAfter = spending - amount;
  return balanceAfter < 0 ? -balanceAfter : 0;
}

/** Whether an integer bid amount is allowed for this listing and balance. */
export function isValidBidAmount(
  amount: number,
  marketValue: number | null,
  money: number | null,
  squadMarketValue: number | null,
  reservedBidMoney = 0,
): boolean {
  if (money == null || marketValue == null) return false;
  if (!Number.isInteger(amount)) return false;
  if (amount < marketValue) return false;

  const spending = spendingPower(money, reservedBidMoney);
  if (spending > 0) return amount < spending;

  const maxDebt = maxAllowedDebt(squadMarketValue);
  if (maxDebt == null) return false;
  return debtAfterBid(spending, amount) <= maxDebt;
}

/** True when at least one whole-euro bid satisfies listing and balance rules. */
export function bidRangeAvailable(
  marketValue: number | null,
  money: number | null,
  squadMarketValue: number | null,
  reservedBidMoney = 0,
): boolean {
  if (money == null || marketValue == null) return false;
  const minBid = marketValue;
  const spending = spendingPower(money, reservedBidMoney);

  if (spending > 0) return minBid < spending;

  const maxDebt = maxAllowedDebt(squadMarketValue);
  if (maxDebt == null) return false;
  const maxBid = spending + maxDebt;
  return minBid <= Math.floor(maxBid);
}

/** Squad and bid caps for a new market bid (not modify). */
export function squadSlotAvailableForNewBid(context: MarketActionContext): boolean {
  const { squadPlayerCount, activeBidCount } = context;
  if (squadPlayerCount == null || activeBidCount == null) return false;
  if (squadPlayerCount >= MAX_SQUAD_PLAYERS) return false;
  return squadPlayerCount + activeBidCount < MAX_SQUAD_PLAYERS;
}

/** Opponent direct-offer listings use ``POST .../direct-offers``, not market bids. */
export function usesDirectOfferBid(row: MarketRow, kind: BidActionKind): boolean {
  return (
    kind === "purchase" &&
    row.directOffer &&
    row.sellerKind === "opponent" &&
    row.playerTeamId != null
  );
}

function listingOpen(row: MarketRow, now: number): boolean {
  const left = remainingMs(row.expiresAt, now);
  return left == null || left > 0;
}

/** True while the release clause lock window has not ended yet. */
export function isClauseTimeLocked(row: MarketRow, now: number): boolean {
  return row.clauseUnlockAt != null && row.clauseUnlockAt > now;
}

function clausePayable(row: MarketRow, money: number | null, now: number): boolean {
  if (!row.playerTeamId || row.isShielded) return false;
  const clause = row.buyoutClause;
  if (clause == null || clause <= 0) return false;
  if (isClauseTimeLocked(row, now) || row.clauseUnlockAt == null) return false;
  if (money == null || money < clause) return false;
  return true;
}

const SQUAD_SLOT_BLOCKED =
  "You need fewer than 24 squad players and room for another bid (players plus active bids must stay under 24).";

const INSUFFICIENT_POSITIVE_BALANCE =
  "Your balance must be greater than the market value and cover the bid.";

const INSUFFICIENT_DEBT_HEADROOM =
  "With a negative balance, the bid cannot push your debt above 20% of squad market value.";

function bidDisabledReason(
  row: MarketRow,
  context: MarketActionContext,
  kind: BidActionKind,
): string {
  if (isCoachMarketHire(row.positionId, kind)) return COACH_HIRE_PREMIUM_MESSAGE;

  const isModify = kind === "modify";
  if (!isModify && !squadSlotAvailableForNewBid(context)) return SQUAD_SLOT_BLOCKED;

  const reserved = isModify ? (row.myBid?.money ?? 0) : 0;
  const spending =
    context.money != null ? spendingPower(context.money, reserved) : null;
  if (spending != null && spending <= 0) return INSUFFICIENT_DEBT_HEADROOM;
  return INSUFFICIENT_POSITIVE_BALANCE;
}

/** Menu entries for a row, including disabled options when balance blocks bidding. */
export function resolveMarketActionOffers(
  row: MarketRow,
  context: MarketActionContext,
): MarketActionOffer[] {
  const offers: MarketActionOffer[] = [];
  const { money, now } = context;

  if (row.sellerKind === "self" || !listingOpen(row, now)) {
    return offers;
  }

  if (row.myBid) {
    offers.push({
      type: "bid",
      kind: "modify",
      label: "Modify bid",
      enabled: true,
    });
    offers.push({
      type: "cancel-bid",
      label: "Cancel bid",
      enabled: true,
    });
    return offers;
  }

  const clause = row.buyoutClause;
  if (
    row.sellerKind === "opponent" &&
    row.playerTeamId &&
    clause != null &&
    clause > 0
  ) {
    const enabled = clausePayable(row, money, now);
    offers.push({
      type: "pay-clause",
      label: "Pay release clause",
      amount: clause,
      enabled,
      disabledReason: enabled
        ? undefined
        : row.isShielded
          ? "This player is shielded."
          : row.clauseUnlockAt == null || row.clauseUnlockAt > now
            ? "The release clause is still locked."
            : "Insufficient balance for the release clause.",
    });
  }

  const bidOffer =
    row.sellerKind === "laliga"
      ? { kind: "hire" as const, label: "Hire" }
      : { kind: "purchase" as const, label: "Purchase bid" };
  const slotOk = squadSlotAvailableForNewBid(context);
  const rangeOk = bidRangeAvailable(row.marketValue, money, context.squadMarketValue, 0);
  const coachHireBlocked = isCoachMarketHire(row.positionId, bidOffer.kind);
  const bidEnabled =
    !coachHireBlocked &&
    slotOk &&
    rangeOk &&
    (!usesDirectOfferBid(row, bidOffer.kind) || row.playerTeamId != null);
  offers.push({
    type: "bid",
    kind: bidOffer.kind,
    label: bidOffer.label,
    enabled: bidEnabled,
    disabledReason: bidEnabled ? undefined : bidDisabledReason(row, context, bidOffer.kind),
  });

  return offers;
}

/** Enabled actions only (for tests and confirm flows). */
export function resolveMarketActions(
  row: MarketRow,
  context: MarketActionContext,
): MarketAction[] {
  const actions: MarketAction[] = [];
  for (const offer of resolveMarketActionOffers(row, context)) {
    if (!offer.enabled) continue;
    if (offer.type === "bid") {
      actions.push({ type: "bid", kind: offer.kind, label: offer.label });
    } else if (offer.type === "pay-clause") {
      actions.push({ type: "pay-clause", label: offer.label, amount: offer.amount });
    }
  }
  return actions;
}
