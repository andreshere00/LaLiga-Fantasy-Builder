export type FeedItem = { publishedAt?: string | null };

export const FEED_STEPS = [5, 10, 20] as const;
export type FeedLimit = (typeof FEED_STEPS)[number] | "all";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Calendar day (Madrid) an event belongs to, or "" when it has no usable timestamp. */
export function feedDay(publishedAt: string | null | undefined): string {
  const parsed = new Date(publishedAt ?? "");
  return Number.isFinite(parsed.getTime()) ? DAY_KEY.format(parsed) : "";
}

/** Range choices worth showing: a step equal to or above the total adds nothing over "All". */
export function feedChoices(total: number): FeedLimit[] {
  if (total <= FEED_STEPS[0]) return [];
  return [...FEED_STEPS.filter((step) => step < total), "all"];
}

export function limitFeed<T>(items: readonly T[], limit: FeedLimit): T[] {
  return limit === "all" ? [...items] : items.slice(0, limit);
}

/** Consecutive events of the same Madrid day, in feed order. */
export function groupByDay<T extends FeedItem>(items: readonly T[]): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = feedDay(item.publishedAt);
    const last = groups.at(-1);
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** Calendar days from the oldest to the newest event, both included. Zero when nothing is dated. */
export function feedSpanDays(items: readonly FeedItem[]): number {
  const days = items.map((item) => feedDay(item.publishedAt)).filter(Boolean).sort();
  if (days.length === 0) return 0;
  const first = Date.parse(`${days[0]}T12:00:00Z`);
  const last = Date.parse(`${days[days.length - 1]}T12:00:00Z`);
  return Math.round((last - first) / 86_400_000) + 1;
}

export type FeedRow<T> = T & { departures?: string[] };

const DEPARTURE = /^(.+?)\s+se marcha con su selecci[oó]n$/i;

/**
 * FutbolFantasy logs one "leaves for the national team" event per player, all within
 * minutes. Consecutive ones become a single row carrying the player names.
 */
export function collapseDepartures<T extends { title: string; kind?: string }>(
  items: readonly T[],
): FeedRow<T>[] {
  const rows: FeedRow<T>[] = [];
  let run: { first: T; names: string[] } | null = null;
  const flush = () => {
    if (!run) return;
    rows.push(run.names.length > 1 ? { ...run.first, departures: run.names } : run.first);
    run = null;
  };
  for (const item of items) {
    const name = item.kind === "national_team" ? DEPARTURE.exec(item.title.trim())?.[1] : undefined;
    if (!name) {
      flush();
      rows.push(item);
    } else if (run) run.names.push(name);
    else run = { first: item, names: [name] };
  }
  flush();
  return rows;
}
