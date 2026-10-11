// ---- Mocks, fixtures & helpers ---- //

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlayerFantasySection } from "./PlayerFantasySection";

afterEach(cleanup);

function profileWithHistory(count: number) {
  return {
    hierarchy: { label: "Key" },
    start_probability: { percent: 80 },
    injury_risk: { level: "low" },
    news: Array.from({ length: count }, (_, index) => ({
      title: `News ${index + 1}`,
      published_at: `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
      url: `https://example.com/news-${index + 1}`,
    })),
    injury_history: Array.from({ length: count }, (_, index) => ({
      diagnosis: `Injury ${index + 1}`,
      start: `2025-01-${String(index + 1).padStart(2, "0")}`,
      end: `2025-02-${String(index + 1).padStart(2, "0")}`,
      duration_days: 10,
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
    expect(screen.getByText("Injury 7 · 10 days")).toBeTruthy();
    expect(screen.queryByText("Injury 2 · 10 days")).toBeNull();

    fireEvent.click(within(newsNav).getByRole("button", { name: "Older news" }));
    expect(within(newsNav).getByText("6–7 of 7")).toBeTruthy();
    expect(screen.getByText("News 2")).toBeTruthy();
    expect(screen.queryByText("News 7")).toBeNull();
    expect(within(injuryNav).getByText("1–5 of 7")).toBeTruthy();

    fireEvent.click(within(injuryNav).getByRole("button", { name: "Older injury records" }));
    expect(within(injuryNav).getByText("6–7 of 7")).toBeTruthy();
    expect(screen.getByText("Injury 2 · 10 days")).toBeTruthy();
  });
});
