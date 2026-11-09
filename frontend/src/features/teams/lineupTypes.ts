import type { PredictedPlayer } from "./teamLineup";

/** A published XI name resolved to a Fantasy player when the club squad or catalog identifies one. */
export type Entry = PredictedPlayer & { playerId: string | null; points: number | null };

export type Outlook = {
  form?: { rating?: string | null } | null;
  startProbability?: { percent?: number | null } | null;
};

export type RecentMap = ReadonlyMap<string, readonly { matchweek: number | null; points: number | null }[]>;
