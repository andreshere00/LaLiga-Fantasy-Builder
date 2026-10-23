import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

it("keeps an aria-disabled action focusable while preventing activation and propagation", () => {
  const action = vi.fn();
  const parent = vi.fn();
  render(<div onClick={parent}><Button aria-disabled="true" onClick={action}>Refresh</Button></div>);
  const button = screen.getByRole("button", { name: "Refresh" });
  button.focus();
  fireEvent.click(button);
  expect(document.activeElement).toBe(button);
  expect(action).not.toHaveBeenCalled();
  expect(parent).not.toHaveBeenCalled();
});

it("identifies a pending operation and prevents a duplicate submission", () => {
  const action = vi.fn();
  const { rerender } = render(<Button onClick={action}>Place bid</Button>);
  fireEvent.click(screen.getByRole("button", { name: "Place bid" }));
  rerender(<Button loading loadingLabel="Sending…" onClick={action}>Place bid</Button>);
  const pending = screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement;
  expect(pending.disabled).toBe(true);
  expect(pending.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(pending);
  expect(action).toHaveBeenCalledOnce();
});

it("preserves the caller's busy state for background actions", () => {
  render(<Button aria-busy="true" aria-disabled="true">Refresh standings</Button>);
  expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
});
