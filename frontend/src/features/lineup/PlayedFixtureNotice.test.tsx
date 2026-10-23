// ---- Mocks, fixtures & helpers ---- //

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { PlayedFixtureNotice } from "./PlayedFixtureNotice";

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="app-shell">
        <button type="button" onClick={() => setOpen(true)}>
          Board
        </button>
      </div>
      <PlayedFixtureNotice open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ---- Happy path ---- //

describe("PlayedFixtureNotice", () => {
  it("PlayedFixtureNotice_open_traps_focus_and_restores_it_on_close", async () => {
    render(<Host />);
    const board = screen.getByRole("button", { name: "Board" });
    board.focus();
    fireEvent.click(board);

    const ok = await screen.findByRole("button", { name: "Close" });
    const close = screen.getByRole("button", { name: "Close dialog" });
    await waitFor(() => {
      expect(document.activeElement).toBe(close);
    });
    expect(screen.queryByRole("button", { name: "Board" })).toBeNull();

    fireEvent.click(ok);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => expect(document.activeElement).toBe(board));
  });
});
