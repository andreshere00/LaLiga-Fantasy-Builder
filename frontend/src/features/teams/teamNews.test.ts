import { describe, expect, it } from "vitest";
import { collapseDepartures, feedChoices, feedDay, feedSpanDays, groupByDay, limitFeed } from "./teamNews";

const at = (publishedAt: string) => ({ publishedAt });

describe("teamNews", () => {
  it("feedChoices_hides_steps_that_would_equal_all", () => {
    expect(feedChoices(4)).toEqual([]);
    expect(feedChoices(7)).toEqual([5, "all"]);
    expect(feedChoices(37)).toEqual([5, 10, 20, "all"]);
    expect(feedChoices(20)).toEqual([5, 10, "all"]);
  });

  it("limitFeed_keeps_the_newest_and_all_returns_everything", () => {
    const items = Array.from({ length: 12 }, (_, index) => index);
    expect(limitFeed(items, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(limitFeed(items, "all")).toHaveLength(12);
  });

  it("groupByDay_splits_on_the_madrid_calendar_day", () => {
    const groups = groupByDay([
      at("2026-11-08T22:26:23+01:00"), at("2026-11-08T08:00:00+01:00"),
      at("2026-11-07T23:59:00+01:00"), at("2026-11-07T23:30:00+00:00"),
    ]);
    expect(groups.map((group) => [group.day, group.items.length])).toEqual([
      ["2026-11-08", 2], ["2026-11-07", 1], ["2026-11-08", 1],
    ]);
  });

  it("feedSpanDays_counts_calendar_days_and_ignores_undated_events", () => {
    expect(feedSpanDays([at("2026-11-08T22:00:00+01:00"), at("2026-11-02T14:31:02+01:00")])).toBe(7);
    expect(feedSpanDays([{ publishedAt: null }])).toBe(0);
    expect(feedDay("not a date")).toBe("");
  });

  it("collapseDepartures_merges_consecutive_national_team_events_into_one_row", () => {
    const leave = (name: string) => ({ title: `${name} se marcha con su selección`, kind: "national_team" });
    const rows = collapseDepartures([
      leave("Imga"), leave("N. Williams"), leave("Sancet"),
      { title: "Yuri está ahora recuperado", kind: "injury_update" },
      leave("Padilla"),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].departures).toEqual(["Imga", "N. Williams", "Sancet"]);
    expect(rows[1].departures).toBeUndefined();
    expect(rows[2].departures).toBeUndefined();
  });
});
