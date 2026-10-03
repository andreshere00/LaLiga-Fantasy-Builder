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
