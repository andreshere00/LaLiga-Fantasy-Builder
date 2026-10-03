// ---- Mocks, fixtures & helpers ---- //

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketToolbar } from "./MarketToolbar";
import { createEmptyMarketFilters } from "./marketFilters";

function renderToolbar(overrides: Partial<Parameters<typeof MarketToolbar>[0]> = {}) {
  const onFiltersChange = vi.fn();
  const onClearFilters = vi.fn();
  render(
    <MarketToolbar
      money={100}
      showSearch
      filters={createEmptyMarketFilters()}
      onFiltersChange={onFiltersChange}
      sellerOptions={[]}
      filtersOpen={false}
      onFiltersOpenChange={vi.fn()}
      activeFilterCount={0}
      onClearFilters={onClearFilters}
      {...overrides}
    />,
  );
  return { onFiltersChange, onClearFilters };
}

// ---- Happy path ---- //

describe("MarketToolbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("MarketToolbar_shows_filter_badge_when_filters_are_active", () => {
    renderToolbar({
      activeFilterCount: 2,
      filters: { ...createEmptyMarketFilters(), text: "laporte" },
    });
    expect(screen.getByLabelText("2 active filters").textContent).toBe("2");
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
  });

  it("MarketToolbar_clear_button_resets_via_callback", () => {
    const { onClearFilters } = renderToolbar({ activeFilterCount: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
