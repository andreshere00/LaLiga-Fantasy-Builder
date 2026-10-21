import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateRangeDialog } from "./DateRangeDialog";

afterEach(cleanup);

describe("Custom value range", () => {
  it("keeps date edits local and submits only a valid confirmed range", () => {
    const apply = vi.fn();
    render(<DateRangeDialog from="2026-10-01" to="2026-10-12" onClose={() => {}} onApply={apply} />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-20" } });
    expect(screen.getByRole("alert").textContent).toContain("Choose an end date on or after the start date.");
    expect((screen.getByRole("button", { name: "Apply range" }) as HTMLButtonElement).disabled).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-22" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(apply).toHaveBeenCalledWith("2026-10-20", "2026-10-22");
  });

  it("does not apply a range when cancelled", () => {
    const close = vi.fn();
    const apply = vi.fn();
    render(<DateRangeDialog from="" to="" onClose={close} onApply={apply} />);
    fireEvent.change(screen.getByLabelText("Last days"), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: "Use last days" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });
});
