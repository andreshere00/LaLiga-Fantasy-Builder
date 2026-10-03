// ---- Mocks, fixtures & helpers ---- //

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

afterEach(cleanup);

function Host({ onClose }: { onClose: () => void }) {
  const [, setTick] = useState<number>(0);
  return (
    <div className="app-shell">
      <button type="button" onClick={() => setTick((value) => value + 1)}>
        rerender
      </button>
      <Modal
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
      </Modal>
    </div>
  );
}

// ---- Happy path ---- //

describe("Modal", () => {
  it("Modal_parent_rerender_keeps_focus_on_the_focused_control", () => {
    render(<Host onClose={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Confirm" });
    confirm.focus();

    fireEvent.click(screen.getByRole("button", { name: "rerender", hidden: true }));

    expect(document.activeElement).toBe(confirm);
  });

  it("Modal_escape_calls_latest_onClose", () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
