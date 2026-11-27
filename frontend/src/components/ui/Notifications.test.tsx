import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Notifications, notify } from "./Notifications";

afterEach(cleanup);

// ---- Mocks, fixtures & helpers ---- //
async function findToast(text: string): Promise<Element> {
  const matches = await screen.findAllByText(text);
  return matches.map((match) => match.closest(".fb-toast")).find(Boolean)!;
}

describe("Notifications", () => {
  it("Notifications_error_toast_shows_an_icon_and_names_the_error", async () => {
    render(<Notifications><span /></Notifications>);
    act(() => notify("Bid could not be placed", "error"));
    const toast = await findToast("Bid could not be placed");
    expect(toast.getAttribute("data-tone")).toBe("error");
    expect(toast.querySelector(".fb-toast-icon")?.textContent).toBe("!");
    expect(toast.querySelector(".visually-hidden")?.textContent).toBe("Error: ");
  });

  it("Notifications_success_toast_shows_a_check_icon", async () => {
    render(<Notifications><span /></Notifications>);
    act(() => notify("Bid cancelled"));
    const toast = await findToast("Bid cancelled");
    expect(toast.querySelector(".fb-toast-icon")?.textContent).toBe("✓");
    expect(toast.querySelector(".visually-hidden")).toBeNull();
  });
});
