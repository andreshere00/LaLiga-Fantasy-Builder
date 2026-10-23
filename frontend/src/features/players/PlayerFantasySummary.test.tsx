import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PlayerFantasySummary } from "./PlayerFantasySection";

afterEach(cleanup);

it.each([0, 85, 100])("shows a reported %i percent estimate without losing its matchday", (percent) => {
  render(<PlayerFantasySummary profile={{ startProbability: { percent, matchweek: 10 } }} />);
  expect(screen.getByText(`${percent}%`)).toBeTruthy();
  expect(screen.getByText("Matchday 10")).toBeTruthy();
  expect(screen.getByRole("meter", { name: "Estimated chance of starting" })
    .getAttribute("value")).toBe(String(percent));
});

it.each([null, -1, 101])("does not turn an unavailable or invalid estimate (%s) into a probability", (percent) => {
  render(<PlayerFantasySummary profile={{ startProbability: { percent } }} />);
  expect(screen.queryByRole("meter")).toBeNull();
  expect(screen.queryByText("0%")).toBeNull();
  expect(screen.getAllByText("Unavailable")).toHaveLength(4);
});

it("keeps a provider's unknown risk and untranslated hierarchy visible", () => {
  render(<PlayerFantasySummary profile={{ hierarchy: { label: "Custom role" },
    injuryRisk: { level: "unknown" }, form: { value: 6.5 } }} />);
  expect(screen.getByText("Custom role")).toBeTruthy();
  expect(screen.getByText("Unknown")).toBeTruthy();
  expect(screen.getByText("6.5")).toBeTruthy();
});
