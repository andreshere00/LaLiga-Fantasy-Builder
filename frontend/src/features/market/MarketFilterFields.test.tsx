// ---- Mocks, fixtures & helpers ---- //

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { FilterStatRange } from "./MarketFilterFields";
import type { NumericRange } from "./marketFilters";

function StatRangeHarness() {
  const [range, setRange] = useState<NumericRange>({ min: null, max: null });
  return <FilterStatRange range={range} onChange={setRange} />;
}

// ---- Happy path ---- //

describe("FilterStatRange", () => {
  it("FilterStatRange_stepping_max_keeps_uncommitted_min_text", () => {
    render(<StatRangeHarness />);
    const minInput = screen.getByLabelText("Minimum");
    const increaseMax = screen.getByRole("button", { name: "Increase Maximum" });

    fireEvent.change(minInput, { target: { value: "12" } });
    fireEvent.click(increaseMax);

    expect(minInput).toHaveProperty("value", "12");
  });
});
