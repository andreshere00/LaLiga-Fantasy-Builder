import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Help } from "./Help";

function tap(element: Element) {
  fireEvent.pointerDown(element, { pointerType: "touch" });
  fireEvent.click(element);
}

describe("Help", () => {
  it("opens and closes on a touch tap for help-only triggers", async () => {
    render(<Help content="Explains the value">Value</Help>);
    const trigger = screen.getByText("Value");
    await act(async () => tap(trigger));
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    await act(async () => tap(trigger));
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("leaves a custom action trigger to its own press", async () => {
    let pressed = 0;
    render(<Help content="Filter by position"
      trigger={<button type="button" onClick={() => { pressed += 1; }} />}>MID</Help>);
    await act(async () => tap(screen.getByRole("button", { name: "MID" })));
    expect(pressed).toBe(1);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
