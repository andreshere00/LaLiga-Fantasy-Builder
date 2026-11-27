// ---- Mocks, fixtures & helpers ---- //
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DiscardDraftDialog } from "./DiscardDraftDialog";

afterEach(cleanup);

function renderDialog(source: "original" | "saved" | null) {
  const onKeep = vi.fn();
  const onDiscard = vi.fn();
  render(<DiscardDraftDialog source={source} weekLabel="F12" onKeep={onKeep} onDiscard={onDiscard} />);
  return { onKeep, onDiscard };
}

// ---- Happy path ---- //
it("discardDraftDialog_confirm_discardsDraft", () => {
  const { onKeep, onDiscard } = renderDialog("saved");

  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

  expect(onDiscard).toHaveBeenCalledOnce();
  expect(onKeep).not.toHaveBeenCalled();
});

it("discardDraftDialog_originalSource_namesTheMatchweek", () => {
  renderDialog("original");

  expect(screen.getByRole("dialog", { name: "Discard unsaved changes?" }).textContent)
    .toContain("Loading the original lineup for F12 replaces the changes you haven't saved.");
});

// ---- Edge cases ---- //
it("discardDraftDialog_keepEditing_leavesDraftAlone", () => {
  const { onKeep, onDiscard } = renderDialog("saved");

  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

  expect(onKeep).toHaveBeenCalledOnce();
  expect(onDiscard).not.toHaveBeenCalled();
});

it("discardDraftDialog_noSource_staysClosed", () => {
  renderDialog(null);

  expect(screen.queryByRole("dialog")).toBeNull();
});
