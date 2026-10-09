import { describe, expect, it } from "vitest";

import {
  formatChartAxisDate,
  formatInjuryHistoryEntry,
  formatMarketChartTick,
  statDisplay,
  mapDetailSegmentBlocks,
  marketChartDomain,
  newsItemHref,
  MISSING_STAT,
  NO_DATA_YET,
  statCount,
  windKmhFromMs,
} from "./playerDetailFormat";

// ---- Mocks, fixtures & helpers ---- #

// ---- Happy path ---- #

describe("windKmhFromMs_validMs_converts", () => {
  it("multiplies by 3.6", () => {
    expect(windKmhFromMs(10)).toBe(36);
  });
});

describe("statCount_unavailableSource_returnsDash", () => {
  it("returns dash for unavailable", () => {
    expect(statCount({ source: "unavailable", count: 1 })).toBe(MISSING_STAT);
  });
});

// ---- Error paths ---- #

describe("statCount_nullValue_returnsDash", () => {
  it("returns dash when missing", () => {
    expect(statCount(null)).toBe(MISSING_STAT);
  });
});

// ---- Edge cases ---- #

describe("windKmhFromMs_null_returnsNull", () => {
  it("returns null", () => {
    expect(windKmhFromMs(null)).toBeNull();
  });
});

describe("mapDetailSegmentBlocks_segmentError_nullsBlock", () => {
  it("mapDetailSegmentBlocks_keepsMarketWhenFixturesErrored", () => {
    const blocks = mapDetailSegmentBlocks({
      fixtures: null,
      market: { window: { series: [] } },
      segment_errors: [{ segment: "fixtures", detail: "timeout" }],
    });
    expect(blocks.fixtures).toBeNull();
    expect(blocks.market).not.toBeNull();
  });
});

describe("NO_DATA_YET_constant", () => {
  it("mapDetailSegmentBlocks_exportsNoDataYetLabel", () => {
    expect(NO_DATA_YET).toBe("No data yet");
  });
});

describe("formatMarketChartTick_largeValue_usesMillions", () => {
  it("formatMarketChartTick_formatsCompactMillions", () => {
    expect(formatMarketChartTick(100_750_000)).toContain("M€");
  });
});

describe("marketChartDomain_flatSeries_addsPadding", () => {
  it("marketChartDomain_spreadsWhenMinEqualsMax", () => {
    const [min, max] = marketChartDomain([100_000_000, 100_000_000]);
    expect(min).toBeLessThan(max);
  });
});

describe("formatChartAxisDate_isoDate_formats", () => {
  it("formatChartAxisDate_parsesIso", () => {
    expect(formatChartAxisDate("2025-09-01")).toMatch(/1/);
  });
});

describe("formatInjuryHistoryEntry_withDatesAndDuration", () => {
  it("formatInjuryHistoryEntry_showsPeriodAndDays", () => {
    const entry = formatInjuryHistoryEntry({
      diagnosis: "Edema en el bíceps femoral",
      start: "2025-10-01",
      end: "2025-10-04",
      duration_days: 3,
      ongoing: false,
    });
    expect(entry.diagnosis).toBe("Edema en el bíceps femoral");
    expect(entry.period).toContain("2025");
    expect(entry.duration).toBe("3 días");
  });
});

describe("formatInjuryHistoryEntry_datesWithoutDuration_computesInclusiveDays", () => {
  it("formatInjuryHistoryEntry_countsInclusiveDays", () => {
    const entry = formatInjuryHistoryEntry({
      diagnosis: "Contusión",
      start: "2026-01-17",
      end: "2026-01-19",
      ongoing: false,
    });
    expect(entry.duration).toBe("3 días");
  });
});

describe("statDisplay_daznField_readsDaznPoints", () => {
  it("statDisplay_usesDaznPointsNotCount", () => {
    expect(statDisplay({ count: null, dazn_points: 2, source: "futbolfantasy" }, "dazn_points")).toBe(
      "2",
    );
  });
});

describe("formatInjuryHistoryEntry_ongoing_showsOngoing", () => {
  it("formatInjuryHistoryEntry_marksOngoing", () => {
    expect(
      formatInjuryHistoryEntry({ diagnosis: "Test", ongoing: true }).duration,
    ).toBe("En curso");
  });
});

describe("newsItemHref_urlPresent_returnsHttps", () => {
  it("newsItemHref_readsUrlField", () => {
    expect(
      newsItemHref({
        title: "Headline",
        url: "https://www.futbolfantasy.com/laliga/noticias/1",
      }),
    ).toBe("https://www.futbolfantasy.com/laliga/noticias/1");
  });
});
