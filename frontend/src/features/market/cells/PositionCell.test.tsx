import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PositionCell } from "./PositionCell";
import { nextPositionFilter, PositionFilterContext } from "./positionFilter";

describe("PositionCell", () => {
  it("click_without_filter_context_stays_static", () => {
    render(<PositionCell positionId={2} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("click_with_filter_context_filters_by_that_position", () => {
    const onFilter = vi.fn();
    render(
      <PositionFilterContext.Provider value={{ selected: new Set(), onFilter }}>
        <PositionCell positionId={2} />
      </PositionFilterContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { pressed: false }));
    expect(onFilter).toHaveBeenCalledWith(new Set([2]));
  });

  it("nextPositionFilter_same_sole_position_clears_filter", () => {
    expect(nextPositionFilter(new Set([2]), 2)).toEqual(new Set());
    expect(nextPositionFilter(new Set([1, 2]), 2)).toEqual(new Set([2]));
  });
});
