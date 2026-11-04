import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { i18n } from "../../i18n";
import { PlayerPerformanceDialog } from "./PlayerPerformanceDialog";
import { PlayerFantasySummary } from "./PlayerFantasySection";

afterEach(() => { cleanup(); void i18n.changeLanguage("en"); });
it("translates available metric headings and definitions", () => {
  void i18n.changeLanguage("es");
  render(<PlayerPerformanceDialog playerName="Demo Player" onClose={() => {}} rows={[
    { code: "G", label: "Goals", value: 1, source: "futbolfantasy", sampleSize: 3 },
  ]} />);
  expect(screen.getByRole("heading", { name: i18n.t("Shooting") })).toBeTruthy();
  expect(screen.getByText(i18n.t("Goals scored."))).toBeTruthy();
  expect(screen.queryByText("Goals scored.")).toBeNull();
  expect(screen.getByText(/Demo Player/)).toBeTruthy();
});
it("identifies unknown original roles and prefers normalized injury risk", () => {
  void i18n.changeLanguage("es");
  render(<PlayerFantasySummary profile={{ hierarchy: { label: "Custom role" },
    injuryRisk: { level: "low", raw: "provider custom risk" } }} />);
  expect(screen.getByText("Etiqueta original de la fuente: Custom role")).toBeTruthy();
  expect(screen.getByText(i18n.t("Low"))).toBeTruthy();
  expect(screen.queryByText("provider custom risk")).toBeNull();
});
