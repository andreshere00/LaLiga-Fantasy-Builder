import { asFiniteNumber, asRecord, idText, mediaFromPlayerMaster, text } from "../../../api/mappers";
import { buyoutClauseUnlockAt } from "./buyout";
import { availabilityOf, type Availability } from "./availability";
import { FORM_DISPLAY_MATCHES, formFromCalendarWeeks, formPoints, formRecentPoints, formRecentWeekNumbers } from "./form";
import {
  expiryOf,
  LALIGA_SELLER,
  masterIdOf,
  masterOf,
  sellerNameOf,
  sellerTeamIdOf,
  type UserBidRef,
} from "./listing";
import { valueVariation, valueVariationPercent, type ValuePoint } from "./valueSeries";

export type SellerKind = "laliga" | "opponent" | "self";

export type MarketRow = {
  id: string;
  marketId: string;
  playerId: string | null;
  playerTeamId: string | null;
  name: string;
  positionId: number | null;
  photoUrl: string | null;
  teamBadgeUrl: string | null;
  points: number | null;
  form: number | null;
  formRecent: readonly number[];
  formRecentWeeks: readonly number[];
  averagePoints: number | null;
  marketValue: number | null;
  variation: number | null;
  variationPercent: number | null;
  availability: Availability;
  expiresAt: number | null;
  seller: string;
  sellerTeamId: string | null;
  sellerKind: SellerKind;
  buyoutClause: number | null;
  clauseUnlockAt: number | null;
  isShielded: boolean;
  myBid: { id: string; money: number } | null;
  directOffer: boolean;
  valueHistory: readonly ValuePoint[];
};

export type CalendarFormContext = {
  weekNumbers: readonly number[];
  statsByWeek: ReadonlyMap<number, ReadonlyMap<string, number>>;
  playedThrough: number;
};

export type MarketRowContext = {
  catalog: ReadonlyMap<string, Record<string, unknown>>;
  history: ReadonlyMap<string, readonly ValuePoint[]>;
  leagueCards?: ReadonlyMap<string, unknown>;
  calendarForm?: CalendarFormContext;
  callerTeamId?: string | null;
  userBidsByMarketId?: ReadonlyMap<string, UserBidRef>;
  buyoutUnlockByPlayerTeamId?: ReadonlyMap<string, number>;
};

function lastStatsFromLeagueCard(card: unknown): unknown {
  const record = asRecord(card);
  const master = asRecord(record?.playerMaster);
  return master?.lastStats ?? record?.lastStats;
}

function displayName(nickname: string | null, fullName: string | null): string {
  return nickname ?? fullName ?? "Player";
}

function playerTeamIdOf(item: Record<string, unknown>): string | null {
  const playerTeam = asRecord(item.playerTeam);
  return idText(playerTeam?.playerTeamId) ?? idText(item.playerTeamId);
}

function myBidOf(item: Record<string, unknown>): MarketRow["myBid"] {
  const bid = asRecord(item.bid);
  const id = idText(bid?.id);
  const money = asFiniteNumber(bid?.money);
  if (!id || money == null) return null;
  return { id, money };
}

function resolveMyBid(
  item: Record<string, unknown>,
  marketId: string,
  userBidsByMarketId?: ReadonlyMap<string, UserBidRef>,
): MarketRow["myBid"] {
  const fromListing = myBidOf(item);
  if (fromListing) return fromListing;
  return userBidsByMarketId?.get(marketId) ?? null;
}

function sellerKindOf(
  sellerLabel: string,
  sellerTeamId: string | null,
  callerTeamId: string | null | undefined,
): SellerKind {
  if (sellerLabel === LALIGA_SELLER && !sellerTeamId) return "laliga";
  if (callerTeamId && sellerTeamId && sellerTeamId === callerTeamId) return "self";
  if (sellerLabel === LALIGA_SELLER) return "laliga";
  return "opponent";
}

/** Joins a market item with its catalog card and value history into a list row. */
export function marketRow(
  item: Record<string, unknown>,
  index: number,
  context: MarketRowContext,
): MarketRow {
  const {
    catalog,
    history,
    leagueCards = new Map(),
    calendarForm,
    callerTeamId,
    userBidsByMarketId,
    buyoutUnlockByPlayerTeamId,
  } = context;
  const playerId = masterIdOf(item);
  const fromCatalog = playerId ? catalog.get(playerId) : null;
  const fromMarket = masterOf(item);
  const leagueCard = playerId ? leagueCards.get(playerId) : null;
  const cardMaster = asRecord(asRecord(leagueCard)?.playerMaster);
  const master: Record<string, unknown> = {
    ...fromCatalog,
    ...fromMarket,
    ...cardMaster,
    lastStats:
      fromMarket?.lastStats ??
      fromCatalog?.lastStats ??
      cardMaster?.lastStats ??
      lastStatsFromLeagueCard(leagueCard),
  };
  const media = mediaFromPlayerMaster(master);
  const valueHistory = playerId ? (history.get(playerId) ?? []) : [];
  const positionId = asFiniteNumber(master.positionId);
  const playedThrough =
    calendarForm != null && calendarForm.playedThrough >= 1
      ? calendarForm.playedThrough
      : null;
  let form = formPoints(master.lastStats, playedThrough);
  let formRecent = formRecentPoints(master.lastStats, playedThrough);
  let formRecentWeeks = formRecentWeekNumbers(master.lastStats, playedThrough);
  if (form == null && calendarForm) {
    const fromCalendar = formFromCalendarWeeks(
      playerId,
      calendarForm.weekNumbers,
      calendarForm.statsByWeek,
    );
    form = fromCalendar.form;
    formRecent = fromCalendar.formRecent;
    formRecentWeeks = calendarForm.weekNumbers.slice(0, FORM_DISPLAY_MATCHES);
  }
  const playerTeam = asRecord(item.playerTeam);
  const playerTeamId = playerTeamIdOf(item);
  const seller = sellerNameOf(item);
  const sellerTeamId = sellerTeamIdOf(item);
  const marketId = idText(item.id) ?? `market-${index}`;
  return {
    id: marketId ?? idText(item.playerTeamId) ?? playerId ?? `row-${index}`,
    marketId,
    playerId,
    playerTeamId,
    name: displayName(text(master.nickname), text(master.name)),
    positionId,
    ...media,
    points: asFiniteNumber(master.points),
    form,
    formRecent,
    formRecentWeeks,
    averagePoints: asFiniteNumber(master.averagePoints),
    marketValue: asFiniteNumber(master.marketValue),
    variation: valueVariation(valueHistory),
    variationPercent: valueVariationPercent(valueHistory),
    availability: availabilityOf(master.playerStatus),
    expiresAt: expiryOf(item),
    seller,
    sellerTeamId,
    sellerKind: sellerKindOf(seller, sellerTeamId, callerTeamId),
    buyoutClause: asFiniteNumber(playerTeam?.buyoutClause),
    clauseUnlockAt:
      buyoutClauseUnlockAt(playerTeam) ??
      buyoutClauseUnlockAt(item) ??
      (playerTeamId ? (buyoutUnlockByPlayerTeamId?.get(playerTeamId) ?? null) : null),
    isShielded: playerTeam?.isShielded === true,
    myBid: resolveMyBid(item, marketId, userBidsByMarketId),
    directOffer: item.directOffer === true,
    valueHistory,
  };
}
