// ---- Mocks, fixtures & helpers ---- //

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./ui/Dialog";

afterEach(cleanup);

function Host({ onClose }: { onClose: () => void }) {
  const [, setTick] = useState<number>(0);
  return (
    <div className="app-shell">
      <button type="button" onClick={() => setTick((value) => value + 1)}>
        rerender
      </button>
      <Dialog
        open
        title="Bid"
        onClose={() => onClose()}
        footer={
          <>
            <button type="button">Cancel</button>
            <button type="button">Confirm</button>
          </>
        }
      >
        <input aria-label="amount" />
      </Dialog>
    </div>
  );
}

// ---- Happy path ---- //

describe("Dialog", () => {
  it("Dialog_parent_rerender_keeps_focus_on_the_focused_control", () => {
    render(<Host onClose={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Confirm" });
    confirm.focus();

    fireEvent.click(screen.getByRole("button", { name: "rerender", hidden: true }));

    expect(document.activeElement).toBe(confirm);
  });

  it("Dialog_escape_calls_latest_onClose", () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Dialog_busy_request_keeps_the_result_visible_until_it_finishes", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Dialog open busy title="Place bid" onClose={onClose}>
      Waiting for confirmation
    </Dialog>);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: "Close dialog" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<Dialog open title="Place bid" onClose={onClose}>Request failed. Try again.</Dialog>);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
