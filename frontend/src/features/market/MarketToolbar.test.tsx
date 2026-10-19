import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketToolbar } from "./MarketToolbar";
import { createEmptyMarketFilters } from "./marketFilters";
import { normalizeActiveBids, projectBids } from "./model/activeBids";

afterEach(cleanup);

function renderToolbar(overrides: Partial<Parameters<typeof MarketToolbar>[0]> = {}) {
  const onFiltersChange = vi.fn();
  const onClearFilters = vi.fn();
  render(
    <MarketToolbar
      money={100}
      showSearch
      filters={createEmptyMarketFilters()}
      onFiltersChange={onFiltersChange}
      activeFilterCount={0}
      onClearFilters={onClearFilters}
      {...overrides}
    />,
  );
  return { onFiltersChange, onClearFilters };
}

describe("MarketToolbar", () => {
  it("MarketToolbar_shows_clear_filters_when_filters_active", () => {
    renderToolbar({ activeFilterCount: 2 });
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("MarketToolbar_clear_filters_invokes_callback", () => {
    const { onClearFilters } = renderToolbar({ activeFilterCount: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});

describe("market money summary", () => {
  it("should reveal projections on demand without expanding the toolbar", async () => {
    const active = normalizeActiveBids({ userBids: [{ id: "bid", status: "pending", money: 200 }] }, [], 0);
    render(<MarketToolbar money={100} projection={projectBids(100, active)}
      projectionRefreshing projectionStale showSearch={false} filters={createEmptyMarketFilters()}
      onFiltersChange={() => {}} activeFilterCount={0} onClearFilters={() => {}} />);
    const summary = screen.getByLabelText("Market money summary");
    expect(summary.textContent).toContain("Amount available100 €");
    expect(screen.queryByText("Projected spending")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show balance details/ }));
    const details = await screen.findByRole("dialog", { name: "Balance details" });
    expect(details.textContent).toContain("Projected spending200 €");
    expect(details.textContent).toContain("Estimated available-100 €");
    expect(screen.queryByText(/Fantasy may already reserve this money/)).toBeNull();
    expect(screen.getByRole("button", { name: "About available balance" })).toBeTruthy();
    expect(summary.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(/cached values may be stale/)).toBeTruthy();
  });

  it("should show unavailable projections when commitments or balance are unknown", async () => {
    render(<MarketToolbar money={null} projection={projectBids(null, normalizeActiveBids(undefined, [], 0))}
      showSearch={false} filters={createEmptyMarketFilters()} onFiltersChange={() => {}}
      activeFilterCount={0} onClearFilters={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Show balance details/ }));
    await screen.findByRole("dialog", { name: "Balance details" });
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText(/Projection incomplete/)).toBeTruthy();
  });
});
