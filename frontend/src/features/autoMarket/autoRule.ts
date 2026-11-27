import { t } from "../../i18n";
import { formatEuro, formatIntegerAmount, parseIntegerAmount, parsePercent } from "../../api/format";
import type { AutoRule, AutoRuleWrite } from "../../api/autoMarket";

export const MIN_PERCENT = 0.1;
export const MAX_SELL_PERCENT = 500;
export const MAX_BUY_PERCENT = 99;
export const MAX_AMOUNT = 999_999_999;
const BASIS_POINTS = 10_000;

export type RuleSide = "sell" | "buy";
/** ``none`` is a sell that only lists the player: it never accepts an offer. */
export type RuleKind = "relative" | "absolute" | "none";
export type RulePriceMode = "threshold" | "market_value";
export type RuleTargetKind = "market" | "clause";

/** What a rule is about. Opened from a market row or from one of your own squad entries. */
export type AutoRuleTarget = {
  side: RuleSide;
  playerId: string;
  playerTeamId: string | null;
  name: string;
  /** Shown beside the name so the manager sees whom the rule is about. */
  photoUrl?: string | null;
  teamBadgeUrl?: string | null;
  marketValue: number | null;
  /** Buy only: a rival-owned squad entry whose release clause may be paid. */
  clause: { amount: number | null; unlockAt: number | null } | null;
  /** Buy: the player is on the market, so a bid is possible. Sell: your own listing is adopted. */
  listed: boolean;
};

export type AutoRuleDraft = {
  kind: RuleKind;
  percent: string;
  amount: string;
  priceMode: RulePriceMode;
  target: RuleTargetKind;
  maxSpend: string;
  /** Sell: list the player on the next check instead of waiting for the threshold. */
  listNow: boolean;
  /** Local calendar day, ``YYYY-MM-DD``, or empty for no deadline. */
  expires: string;
};

export type DraftField = "percent" | "amount" | "maxSpend" | "expires";
export type DraftErrors = Partial<Record<DraftField, string>>;

/** Buy rule for a player who may not be on the market yet: it waits and bids only within the target. */
export const waitsForMarket = (target: AutoRuleTarget) =>
  target.side === "buy" && !target.listed && target.clause == null;

export function defaultDraft(target: AutoRuleTarget): AutoRuleDraft {
  const waiting = waitsForMarket(target);
  const clauseOnly = target.side === "buy" && !target.listed && target.clause != null;
  return {
    kind: waiting ? "absolute" : "relative",
    // A player already on the market is adopted at once, so offers are accepted from the start.
    listNow: target.side === "sell" && target.listed,
    percent: "5",
    amount: waiting && target.marketValue ? formatIntegerAmount(target.marketValue) : "",
    priceMode: "threshold",
    target: clauseOnly ? "clause" : "market",
    // The cap starts at the current value: the most conservative amount that can still buy.
    maxSpend: target.side === "buy" && target.marketValue ? formatIntegerAmount(target.marketValue) : "",
    expires: "",
  };
}

export function draftFromRule(rule: AutoRule): AutoRuleDraft {
  return {
    kind: rule.triggerKind,
    percent: rule.triggerPercent == null ? "5" : String(rule.triggerPercent),
    amount: rule.triggerAmount == null ? "" : formatIntegerAmount(rule.triggerAmount),
    priceMode: rule.priceMode,
    target: rule.target,
    maxSpend: rule.maxSpend == null ? "" : formatIntegerAmount(rule.maxSpend),
    listNow: rule.listNow === true,
    expires: rule.expiresAt ? localDay(new Date(rule.expiresAt)) : "",
  };
}

export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The value a rule waits for. Relative sells round up and buys round down, as the server does. */
export function thresholdAmount(
  side: RuleSide, kind: RuleKind, baseline: number, percent: number | null, amount: number | null,
): number | null {
  if (kind === "none") return baseline;
  if (kind === "absolute") return amount;
  if (percent == null) return null;
  const bps = Math.round(percent * 100);
  return side === "sell"
    ? Math.ceil((baseline * (BASIS_POINTS + bps)) / BASIS_POINTS)
    : Math.max(1, Math.floor((baseline * (BASIS_POINTS - bps)) / BASIS_POINTS));
}

export function thresholdReached(side: RuleSide, threshold: number, value: number): boolean {
  return side === "sell" ? value >= threshold : value <= threshold;
}

/** Parse the inputs the preview needs; ``null`` while a field is blank or invalid. */
export function draftThreshold(side: RuleSide, draft: AutoRuleDraft, baseline: number | null): number | null {
  if (baseline == null) return null;
  const percent = parsePercent(draft.percent);
  const amount = parseIntegerAmount(draft.amount);
  if (draft.kind === "relative" && (percent == null || !percentInRange(side, percent))) return null;
  if (draft.kind === "absolute" && (amount == null || amount < 1 || amount > MAX_AMOUNT)) return null;
  return thresholdAmount(side, draft.kind, baseline, percent, amount);
}

function percentInRange(side: RuleSide, percent: number): boolean {
  const ceiling = side === "sell" ? MAX_SELL_PERCENT : MAX_BUY_PERCENT;
  return percent >= MIN_PERCENT && percent <= ceiling && Math.round(percent * 100) / 100 === percent;
}

export function validateDraft(
  target: AutoRuleTarget, draft: AutoRuleDraft, now: number,
): { errors: DraftErrors; write: AutoRuleWrite | null } {
  const errors: DraftErrors = {};
  const percent = parsePercent(draft.percent);
  const amount = parseIntegerAmount(draft.amount);
  const maxSpend = parseIntegerAmount(draft.maxSpend);
  if (draft.kind === "relative") {
    if (percent == null || !percentInRange(target.side, percent)) {
      errors.percent = t("Enter a percentage from {{0}} to {{1}}, with at most two decimals.", {
        0: MIN_PERCENT.toLocaleString(), 1: target.side === "sell" ? MAX_SELL_PERCENT : MAX_BUY_PERCENT,
      });
    }
  } else if (draft.kind === "absolute" && (amount == null || amount < 1 || amount > MAX_AMOUNT)) {
    errors.amount = t("Enter a whole euro amount up to {{0}}.", { 0: formatEuro(MAX_AMOUNT) });
  }
  if (target.side === "buy") {
    if (maxSpend == null || maxSpend < 1 || maxSpend > MAX_AMOUNT) {
      errors.maxSpend = t("Set the most this rule may spend, as a whole euro amount.");
    }
  }
  let expiresAt: string | undefined;
  if (draft.expires) {
    const [year, month, day] = draft.expires.split("-").map(Number);
    const end = new Date(year, (month ?? 1) - 1, day ?? 1, 23, 59, 59);
    if (!year || Number.isNaN(end.getTime()) || end.getTime() <= now) {
      errors.expires = t("Choose a day that has not passed yet.");
    } else expiresAt = end.toISOString();
  }
  if (Object.keys(errors).length > 0) return { errors, write: null };
  const clause = target.side === "buy" && draft.target === "clause";
  const write: AutoRuleWrite = {
    side: target.side,
    target: clause ? "clause" : "market",
    playerId: target.playerId,
    triggerKind: draft.kind,
    // A list-only rule lists at the market value, the only price that needs no trigger.
    priceMode: clause ? "threshold" : draft.kind === "none" ? "market_value" : draft.priceMode,
    ...(target.playerTeamId && (target.side === "sell" || clause) ? { playerTeamId: target.playerTeamId } : {}),
    ...(draft.kind === "relative" ? { triggerPercent: percent! } : {}),
    ...(draft.kind === "absolute" ? { triggerAmount: amount! } : {}),
    ...(target.side === "buy" ? { maxSpend: maxSpend! } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(target.side === "sell" && draft.listNow ? { listNow: true } : {}),
  };
  return { errors, write };
}

/**
 * ``list`` only puts each player on the market; ``offer`` lists at once and sells to an offer that
 * reaches the gain; ``rise`` waits for each value to rise by the gain before listing.
 */
export type BulkSellMode = "list" | "offer" | "rise";

type BulkCard = { id: string; masterPlayerId: string | null; marketValue: number | null; name: string };

/** One sell rule per card; the percentage is read only when the mode needs it. */
export function bulkSellWrites(
  cards: readonly BulkCard[],
  mode: BulkSellMode,
  percentText: string,
): { writes: AutoRuleWrite[] | null; percentError: string | null } {
  const base = (card: BulkCard) => ({
    side: "sell" as const, target: "market" as const, playerId: card.masterPlayerId!, playerTeamId: card.id,
  });
  if (mode === "list") {
    return {
      percentError: null,
      writes: cards.map((card) => ({ ...base(card), triggerKind: "none", priceMode: "market_value" })),
    };
  }
  const percent = parsePercent(percentText);
  if (percent == null || !percentInRange("sell", percent)) {
    return {
      writes: null,
      percentError: t("Enter a percentage from {{0}} to {{1}}, with at most two decimals.", {
        0: MIN_PERCENT.toLocaleString(), 1: MAX_SELL_PERCENT,
      }),
    };
  }
  return {
    percentError: null,
    writes: cards.map((card) => ({
      ...base(card), triggerKind: "relative", triggerPercent: percent, priceMode: "threshold",
      ...(mode === "offer" ? { listNow: true } : {}),
    })),
  };
}

/** A favorite a rule can be armed for; ``playerTeamId`` is set only for your own squad entries. */
export type FavoriteCandidate = {
  playerId: string;
  playerTeamId: string | null;
  name: string;
  photoUrl?: string | null;
  teamBadgeUrl?: string | null;
  marketValue: number | null;
};

/** ``market`` uses each player's own market value; ``amount`` uses one amount for all of them. */
export type FavoritePriceMode = "market" | "amount";

/**
 * One rule per favorite, at the market value or at a fixed amount. A sell lists the player on
 * the next check and accepts an offer from that price; a buy bids that price and never more.
 * A player without a known market value cannot be armed at the market value.
 */
export function favoriteRuleWrites(
  side: RuleSide,
  players: readonly FavoriteCandidate[],
  mode: FavoritePriceMode,
  amountText: string,
): { writes: AutoRuleWrite[] | null; amountError: string | null } {
  const amount = parseIntegerAmount(amountText);
  if (mode === "amount" && (amount == null || amount < 1 || amount > MAX_AMOUNT)) {
    return {
      writes: null,
      amountError: t("Enter a whole euro amount up to {{0}}.", { 0: formatEuro(MAX_AMOUNT) }),
    };
  }
  const writes: AutoRuleWrite[] = [];
  for (const player of players) {
    const price = mode === "amount" ? amount : player.marketValue;
    if (price == null || price < 1 || price > MAX_AMOUNT) continue;
    writes.push({
      side, target: "market", playerId: player.playerId,
      triggerKind: "absolute", triggerAmount: price,
      priceMode: mode === "amount" ? "threshold" : "market_value",
      ...(side === "sell" ? { playerTeamId: player.playerTeamId!, listNow: true } : { maxSpend: price }),
    });
  }
  return { writes, amountError: null };
}

const REASONS: Record<string, string> = {
  left_squad: "The player left your squad.",
  already_owned: "The player is already in your squad.",
  ownership_changed: "The player changed owner.",
  interrupted: "The result is unknown. Check your market and squad.",
  deadline_passed: "The deadline passed before the value was reached.",
  listing_ended: "The listing ended without an offer you set to accept.",
  already_listed: "The player was already on the market.",
  over_max_spend: "The price is above the most this rule may spend.",
  insufficient_funds: "There was not enough cash.",
  squad_full: "Your squad is full.",
  balance_unavailable: "Your balance could not be read.",
  already_bid: "You already have a bid on this listing.",
  unlock_unknown: "The release clause lock date is unknown.",
  clauses_disabled: "Release clauses are disabled in this league.",
  clause_unknown: "The release clause price is unknown.",
  shield_active_or_unknown: "The player is shielded or the shield could not be confirmed.",
  snapshot_unavailable: "LaLiga data was unavailable. The rule will try again.",
};

/** User-facing explanation of an attempt; unknown codes never leak raw upstream text. */
export function reasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return t(REASONS[reason] ?? "Check your market to see what happened.");
}

export const STATE_LABELS = {
  armed: "Armed",
  listed: "Listed, waiting for an offer",
  executing: "Running",
  executed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
} as const;

export const isLive = (state: AutoRule["state"]) =>
  state === "armed" || state === "listed" || state === "executing";
