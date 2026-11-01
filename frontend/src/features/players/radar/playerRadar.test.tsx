import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, paths } from "../../../api/client";
import { playerRadarResponseSchema } from "../../../api/schemas";
import { type PlayerRadarDto } from "../../../api/radar";
import { canCompareRadars, PlayerRadarPlot } from "./PlayerRadarPlot";
import { suppliedRadars } from "./PlayerRadarPreviewPage";
import examples from "./examples.json";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadarChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  PolarAngleAxis: () => null, PolarRadiusAxis: () => null, PolarGrid: () => null,
  Radar: ({ name }: { name: string }) => <polygon data-testid="radar-polygon" aria-label={name} />,
}));
afterEach(cleanup);
const clone = (i = 0) => structuredClone(suppliedRadars[i]);
const envelope = (radar: unknown = examples[0]) => ({
  player_id: "1", season: "2026-27", available_seasons: ["2026-27"], status: "available",
  reason: null, radars: [radar], compatible_players: [], comparison: null, comparison_reason: null,
});
function comparable(): PlayerRadarDto {
  return { ...clone(), cohort: { id: "test", label: "Test", referenceSnapshot: "v1", eligibility: "300 minutes", size: 100, minimumMinutes: 300 }, comparisonKey: "compatible", comparisonReason: null };
}

// ---- Happy path ---- //
describe("role radar contract and supplied examples", () => {
  it.each([
    [0, "Pau Cubarsí", 668, [99.7, 93.7, 90.5, 27, 34.6, 95.9, 92.4]],
    [1, "Xavi Espart", 712, [16.1, 61.9, 11.8, 44.6, 67.8, 75.9, 67.2]],
    [2, "Joan García", 849, [58, 81.2, 100, 42.8, 1.4, 36.2, 58]],
    [3, "Raphinha", 712, [100, 90.7, 96.9, 33, 76.3, 98.5, 27.3]],
    [4, "Lamine Yamal", 915, [88.8, 96.2, 97.3, 98.6, 97, 98.4, 68.4]],
    [5, "Pedri", 769, [44.3, 55.7, 63.9, 87.9, 59.4, 84.8, 97.1]],
  ] as const)("preserves supplied player %s, all seven values and minutes", (index, name, minutes, values) => {
    const radar = suppliedRadars[index];
    expect(radar.player).toBe(name);
    expect(radar.minutes).toBe(minutes);
    expect(radar.axes.map((axis) => axis.percentile)).toEqual(values);
    expect(radar.axes.some((axis) => /minutes/.test(axis.key))).toBe(false);
  });
  it("parses Python wire fields through the actual shared HTTP client", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope()), { status: 200 }));
    const response = await getJson(paths.playerRadar("1", "2026-27"), "token", { fetchFn });
    expect(response.radars[0].profileLabel).toBe("Progression defense");
    expect(response.radars[0].axes[0].percentile).toBe(99.7);
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer token");
  });
  it("shows exact percentiles in an accessible table and preserves both 58.0 values", () => {
    render(<PlayerRadarPlot radar={clone(2)} />);
    const table = screen.getByRole("table", { name: "Percentiles for Joan García" });
    expect(within(table).getAllByRole("row")).toHaveLength(8);
    expect(within(table).getAllByText("P58.0")).toHaveLength(2);
    expect(screen.getByText("849")).toBeTruthy();
    expect(screen.getByText(/source check pending/)).toBeTruthy();
  });
  it("shows a compatible comparator with a separate column", () => {
    const a = comparable(); const b = { ...comparable(), playerId: "99", player: "Other player" };
    expect(canCompareRadars(a, b)).toBe(true);
    render(<PlayerRadarPlot radar={a} comparison={b} />);
    expect(screen.getAllByTestId("radar-polygon")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Other player" })).toBeTruthy();
  });
});

// ---- Error paths ---- //
describe("invalid or incompatible radar data", () => {
  it.each(["2026-28", "26/27", "nan"])("rejects invalid season %s before fetch", async (season) => {
    const fetchFn = vi.fn();
    await expect(getJson(`/api/players/1/stats/radar?season=${season}`, "token", { fetchFn })).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1, 101, true])("rejects corrupt percentile %s", (value) => {
    const row = structuredClone(examples[0]);
    Object.assign(row.axes[0], { percentile: value });
    expect(playerRadarResponseSchema.safeParse(envelope(row)).success).toBe(false);
  });
  it("rejects a wrong metric order rather than silently rotating spokes", () => {
    const row = structuredClone(examples[0]); row.axes.reverse();
    expect(playerRadarResponseSchema.safeParse(envelope(row)).success).toBe(false);
  });
  it("never overlays the two Defense profiles or unknown populations", () => {
    expect(canCompareRadars(clone(), clone(1))).toBe(false);
    expect(canCompareRadars(clone(), { ...clone(), playerId: "99" })).toBe(false);
    render(<PlayerRadarPlot radar={clone()} comparison={clone(1)} />);
    expect(screen.getAllByTestId("radar-polygon")).toHaveLength(1);
    expect(screen.getByText(/cannot be overlaid/)).toBeTruthy();
  });
});

// ---- Edge cases ---- //
describe("partial radar", () => {
  it("hides the polygon for a missing value, while retaining all seven axes", () => {
    const radar = clone(); radar.axes[0].percentile = null; radar.axes[0].status = "not_published";
    render(<PlayerRadarPlot radar={radar} />);
    expect(screen.queryByTestId("radar-polygon")).toBeNull();
    expect(screen.getByRole("cell", { name: "Not published" })).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(8);
  });
  it("keeps a genuine zero visible and renders the polygon", () => {
    const radar = clone(); radar.axes[0].percentile = 0;
    render(<PlayerRadarPlot radar={radar} />);
    expect(screen.getByRole("cell", { name: "P0.0" })).toBeTruthy();
    expect(screen.getByTestId("radar-polygon")).toBeTruthy();
  });
});
