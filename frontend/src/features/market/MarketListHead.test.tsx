import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketListHead } from "./MarketListHead";
import { createEmptyMarketFilters } from "./marketFilters";
import { marketColumnHeadings } from "./marketColumnHeadings";

afterEach(cleanup);

describe("Market filter editing", () => {
  it("applies the draft only on confirmation and discards cancelled edits", async () => {
    const filters = createEmptyMarketFilters();
    const apply = vi.fn();
    render(<ul><MarketListHead filters={filters} headings={marketColumnHeadings(filters)}
      sellers={[]} onFiltersChange={apply} /></ul>);
    const trigger = screen.getByRole("button", { name: "Filter Player" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.change(await screen.findByLabelText("Player name"), { target: { value: "Pedri" } });
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect((await screen.findByLabelText("Player name") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Player name"), { target: { value: "Pedri" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(apply).toHaveBeenCalledWith({ ...filters, player: "Pedri" });
  });
});
