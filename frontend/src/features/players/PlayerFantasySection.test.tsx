// ---- Mocks, fixtures & helpers ---- //

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlayerFantasySection } from "./PlayerFantasySection";

afterEach(cleanup);

function profileWithHistory(count: number) {
  return {
    hierarchy: { label: "Key" },
    startProbability: { percent: 80 },
    injuryRisk: { level: "low" },
    news: Array.from({ length: count }, (_, index) => ({
      title: `News ${index + 1}`,
      publishedAt: `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
      url: `https://example.com/news-${index + 1}`,
    })),
    injuryHistory: Array.from({ length: count }, (_, index) => ({
      diagnosis: `Injury ${index + 1}`,
      start: `2025-01-${String(index + 1).padStart(2, "0")}`,
      end: `2025-02-${String(index + 1).padStart(2, "0")}`,
      durationDays: 10,
    })),
  };
}

// ---- Happy path ---- //

describe("PlayerFantasySection history pagination", () => {
  it("PlayerFantasySection_limitsNewsAndInjuriesToFiveAndPagesOlderRecordsIndependently", () => {
    render(<PlayerFantasySection profile={profileWithHistory(7)} />);

    const newsNav = screen.getByRole("navigation", { name: "News history pages" });
    const injuryNav = screen.getByRole("navigation", { name: "Injury records history pages" });

    expect(within(newsNav).getByText("1–5 of 7")).toBeTruthy();
    expect(within(injuryNav).getByText("1–5 of 7")).toBeTruthy();
    expect(screen.getByText("News 7")).toBeTruthy();
    expect(screen.queryByText("News 2")).toBeNull();
    expect(screen.getByRole("heading", { name: "Injury 7" })).toBeTruthy();
    expect(screen.getAllByLabelText("10 days")).toHaveLength(5);
    expect(screen.queryByText("Injury 2")).toBeNull();

    fireEvent.click(within(newsNav).getByRole("button", { name: "Page 2" }));
    expect(within(newsNav).getByText("6–7 of 7")).toBeTruthy();
    expect(screen.getByText("News 2")).toBeTruthy();
    expect(screen.queryByText("News 7")).toBeNull();
    expect(within(injuryNav).getByText("1–5 of 7")).toBeTruthy();

    fireEvent.click(within(injuryNav).getByRole("button", { name: "Page 2" }));
    expect(within(injuryNav).getByText("6–7 of 7")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Injury 2" })).toBeTruthy();
  });

  it("keeps current injuries ahead of older records without claiming an unreported end", () => {
    render(<PlayerFantasySection profile={{ news: [], injuryHistory: [
      { diagnosis: "Recent ended injury", start: "2026-10-01", end: "2026-10-04", durationDays: 4 },
      { diagnosis: "Unreported end", start: "2026-09-01", end: null },
      { diagnosis: "Current injury record", start: "2026-08-01", ongoing: true, end: "2026-12-01" },
    ] }} />);
    const history = screen.getByRole("region", { name: "Injury history" });
    const items = within(history).getAllByRole("listitem");
    expect(within(items[0]).getByRole("heading", { name: "Current injury record" })).toBeTruthy();
    expect(within(items[0]).getByText("Current injury", { exact: true })).toBeTruthy();
    expect(within(items[0]).queryByText("1 Dec 2026")).toBeNull();
    expect(within(items[1]).getByText("Ended", { exact: true })).toBeTruthy();
    expect(within(items[2]).getByText("End date unreported", { exact: true })).toBeTruthy();
  });

  it("renders full headlines, safe external links and explicit unavailable links", () => {
    const title = "A complete headline with all the details a reader needs to decide whether to open this article";
    render(<PlayerFantasySection profile={{ injuryHistory: [], news: [
      { title, source: "Reporter", publishedAt: "2026-10-18", url: "https://example.com/report" },
      { title: "Invalid article URL", url: "javascript:alert(1)" },
    ] }} />);
    const link = screen.getByRole("link", { name: title });
    expect(link.getAttribute("href")).toBe("https://example.com/report");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(document.getElementById(link.getAttribute("aria-describedby")!)?.textContent)
      .toBe("Opens in a new tab.");
    expect(screen.getByRole("heading", { name: title }).textContent).toBe(title);
    expect(screen.queryByRole("link", { name: "Invalid article URL" })).toBeNull();
    expect(screen.getByText("Article link unavailable")).toBeTruthy();
  });

  it("distinguishes empty records from an unavailable profile", () => {
    const view = render(<PlayerFantasySection profile={{ news: [], injuryHistory: [] }} />);
    expect(screen.getByText("No recent news available.")).toBeTruthy();
    expect(screen.getByText("No injury history available.")).toBeTruthy();
    view.rerender(<PlayerFantasySection profile={null} />);
    expect(screen.getByText("News & injuries data is temporarily unavailable.")).toBeTruthy();
    expect(screen.queryByText("No injury history available.")).toBeNull();
  });
});
