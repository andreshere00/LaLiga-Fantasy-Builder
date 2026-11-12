import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import response from "../../../../contracts/lineup-builder-response.json";
import { getJson } from "../../api/client";
import { streamLineupBuild } from "../../api/lineupBuild";
import {
  lineupBuildResponseSchema,
  type LineupBuildDto,
  type LineupBuildProgress,
} from "../../api/schemas";
import { LineupBuilderDialog } from "./LineupBuilderDialog";

vi.mock("../../api/lineupBuild", () => ({ streamLineupBuild: vi.fn() }));
vi.mock("../../api/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/client")>(), getJson: vi.fn(),
}));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { userId: "u1" }, accessToken: "token", markNeedsReauth: vi.fn(),
}) }));
vi.mock("./LeagueProvider", () => ({ useLeague: () => ({
  selected: { id: "l1", team: { id: "t1" } },
}) }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getJson).mockResolvedValue([]);
});
afterEach(cleanup);

it.each([
  ["sources", "Building recommendations…"],
  ["players", "Evaluating players: 1/2"],
  ["trades", "Checking trade options…"],
  ["search", "Finding the best lineups…"],
  ["explanation", "Writing explanations…"],
  ["complete", "Recommendations ready"],
] as const)("shows progress copy for the %s stage", async (stage, expectedLabel) => {
  let publish!: (progress: LineupBuildProgress) => void;
  let finish!: (result: LineupBuildDto) => void;
  const result = lineupBuildResponseSchema.parse(response.payload);
  vi.mocked(streamLineupBuild).mockImplementationOnce((_league, _token, _request, onProgress) => {
    publish = onProgress;
    return new Promise((resolve) => { finish = resolve; });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <LineupBuilderDialog open onClose={vi.fn()} ranking={[]} squad={[]} selectedTeamId="t1"
      formations={[]} canApply={() => true} onApply={vi.fn()} isDraftDirty={() => false} />
  </QueryClientProvider>);

  fireEvent.click(screen.getByRole("button", { name: "Build" }));
  act(() => publish({ stage, percent: 25, completedPlayers: 1, totalPlayers: 2 }));
  expect(screen.getByText(expectedLabel)).toBeTruthy();
  await act(async () => { finish(result); });
  client.clear();
});

it.each(["success", "cancel"])("should discard an old draft confirmation after rebuild %s", async (outcome) => {
  const first = lineupBuildResponseSchema.parse(response.payload);
  const second = lineupBuildResponseSchema.parse(response.payload);
  first.candidates = first.candidates.slice(0, 1);
  second.candidates = second.candidates.slice(0, 1);
  second.buildId = "second-build";
  second.target.week = first.target.week + 1;
  second.candidates[0].candidateId = "second-candidate";
  let finish!: (result: LineupBuildDto) => void;
  vi.mocked(streamLineupBuild).mockResolvedValueOnce(first)
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const onApply = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <LineupBuilderDialog open onClose={vi.fn()} ranking={[]} squad={[]} selectedTeamId="t1"
      formations={[]} canApply={() => true} onApply={onApply} isDraftDirty={() => true} />
  </QueryClientProvider>);

  fireEvent.click(screen.getByRole("button", { name: "Build" }));
  fireEvent.click(await screen.findByRole("button", { name: "Use as draft" }));
  expect(screen.getByRole("region", { name: "Replace draft confirmation" })).toBeTruthy();

  fireEvent.click(screen.getByLabelText("4-3-3"));
  fireEvent.click(screen.getByRole("button", { name: "Build" }));
  expect(screen.queryByRole("region", { name: "Replace draft confirmation" })).toBeNull();
  if (outcome === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel build" }));
  await act(async () => { finish(second); });
  expect(screen.queryByRole("region", { name: "Replace draft confirmation" })).toBeNull();
  expect(onApply).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Use as draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Replace draft" }));
  const current = outcome === "success" ? second : first;
  expect(onApply).toHaveBeenCalledExactlyOnceWith(current.candidates[0], current.target.week);
  client.clear();
});

it("shows actionable build diagnostics as a readable list without losing settings", async () => {
  const { ApiError } = await import("../../api/errors");
  vi.mocked(streamLineupBuild).mockRejectedValueOnce(new ApiError(409, "no_feasible_lineup", [
    { code: "cash_conservative_bid_reserve", playerId: null },
    { code: "player_identity_ambiguous", playerId: "3284" },
  ]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <LineupBuilderDialog open onClose={vi.fn()} ranking={[]} squad={[]} selectedTeamId="t1"
      formations={[]} canApply={() => true} onApply={vi.fn()} isDraftDirty={() => false} />
  </QueryClientProvider>);
  fireEvent.click(screen.getByLabelText("4-3-3"));
  fireEvent.click(screen.getByRole("button", { name: "Build" }));
  const alert = await screen.findByRole("alert");
  expect(alert.querySelectorAll("li")).toHaveLength(2);
  expect(alert.textContent).toContain("could not be matched to the catalog club");
  expect(alert.textContent).toContain("Review pending bids in Market");
  expect((screen.getByLabelText("4-3-3") as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("button", { name: "Build" }).hasAttribute("disabled")).toBe(false);
  client.clear();
});

it("translates builder source labels and counts without losing selected formations", async () => {
  const { squadCards } = await import("../../api/mappers");
  const squad = squadCards([{ playerTeamId: "entry1", playerMaster: { id: "1", nickname: "Player from vs offers", positionId: 1 } }], null);
  const { i18n } = await import("../../i18n");
  void i18n.changeLanguage("es");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    render(<QueryClientProvider client={client}>
      <LineupBuilderDialog open onClose={vi.fn()} ranking={[]} squad={squad} selectedTeamId="t1"
        formations={[]} canApply={() => true} onApply={vi.fn()} isDraftDirty={() => false} />
    </QueryClientProvider>);
    expect(screen.getByRole("checkbox", { name: "Mi plantilla: Considerar jugadores en plantilla" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Mercado: Considerar jugadores en el mercado" })).toBeTruthy();
    fireEvent.click(screen.getByText("Elige qué jugadores quieres en el XI"));
    expect(screen.getByRole("button", { name: "Player from vs offers Mi plantilla" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("4-3-3"));
    expect(screen.getByText("1 formación seleccionada")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("4-4-2"));
    expect(screen.getByText("2 formaciones seleccionadas")).toBeTruthy();
    await act(() => i18n.changeLanguage("en"));
    expect(screen.getByText("2 formations selected")).toBeTruthy();
    expect((screen.getByLabelText("4-3-3") as HTMLInputElement).checked).toBe(true);
  } finally { void i18n.changeLanguage("en"); client.clear(); }
});

function renderDialog(canApply: () => boolean = () => true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <LineupBuilderDialog open onClose={vi.fn()} ranking={[]} squad={[]} selectedTeamId="t1"
      formations={[]} canApply={canApply} onApply={vi.fn()} isDraftDirty={() => false} />
  </QueryClientProvider>);
  return client;
}

it("opens with purchases and sales allowed and every dependent option off", () => {
  const client = renderDialog();
  const buy = screen.getByRole("checkbox", { name: /Allow purchase recommendations/ }) as HTMLInputElement;
  const sell = screen.getByRole("checkbox", { name: /Allow sale recommendations/ }) as HTMLInputElement;
  const nonnegative = screen.getByRole("checkbox", { name: /Non-negative balance at kickoff/ }) as HTMLInputElement;
  const immediate = screen.getByRole("checkbox", { name: /Allow immediate sales/ }) as HTMLInputElement;
  expect(buy.checked).toBe(true);
  expect(sell.checked).toBe(true);
  expect(nonnegative.checked).toBe(false);
  expect(immediate.checked).toBe(false);
  expect((screen.getByRole("radio", { name: /Market value/ }) as HTMLInputElement).checked).toBe(true);

  fireEvent.click(sell);
  expect(nonnegative.disabled).toBe(true);
  expect(immediate.disabled).toBe(true);
  client.clear();
});

it("separates purchase options from sale options and disables each group with its switch", () => {
  const client = renderDialog();
  const purchases = screen.getByRole("group", { name: "Purchase options" }) as HTMLFieldSetElement;
  const sales = screen.getByRole("group", { name: "Sale options" }) as HTMLFieldSetElement;
  expect(purchases.contains(screen.getByRole("radiogroup", { name: "Bid amount" }))).toBe(true);
  expect(purchases.contains(screen.getByRole("checkbox", { name: /Allow immediate sales/ }))).toBe(false);
  expect(sales.contains(screen.getByRole("checkbox", { name: /Allow immediate sales/ }))).toBe(true);

  fireEvent.click(screen.getByRole("checkbox", { name: /Allow purchase recommendations/ }));

  expect(purchases.disabled).toBe(true);
  expect(sales.disabled).toBe(false);
  expect(purchases.textContent).toContain("Available when purchase recommendations are allowed.");
  client.clear();
});

it("sends the funding and bid options with the build request", async () => {
  vi.mocked(streamLineupBuild).mockReturnValueOnce(new Promise(() => {}));
  const client = renderDialog();
  fireEvent.click(screen.getByRole("checkbox", { name: /Non-negative balance at kickoff/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Allow immediate sales/ }));
  fireEvent.click(screen.getByRole("radio", { name: /Maximum profitable bid/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Minimum return (%)" }), { target: { value: "5" } });

  fireEvent.click(screen.getByRole("button", { name: "Build" }));

  expect(vi.mocked(streamLineupBuild).mock.calls[0][2]).toMatchObject({
    allowBuying: true, allowSelling: true, requireNonnegativeCash: true,
    allowImmediateSale: true, bidStrategy: "max_profitable", minBidReturn: 0.05,
  });
  client.clear();
});

it("keeps the draft disabled while a required non-negative balance is still below zero", async () => {
  const result = lineupBuildResponseSchema.parse(response.payload);
  vi.mocked(streamLineupBuild).mockResolvedValueOnce(result);
  vi.mocked(getJson).mockImplementation(async (path: string) =>
    path.endsWith("/money") ? { teamMoney: -50 } : []);
  const client = renderDialog();
  fireEvent.click(screen.getByRole("checkbox", { name: /Non-negative balance at kickoff/ }));

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Build" })); });

  for (const button of screen.getAllByRole("button", { name: "Use as draft" })) {
    expect((button as HTMLButtonElement).disabled).toBe(true);
  }
  client.clear();
});

it("keeps the funding gate of the build that produced the results after a failed rebuild", async () => {
  const result = lineupBuildResponseSchema.parse(response.payload);
  vi.mocked(streamLineupBuild).mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("contract"));
  vi.mocked(getJson).mockImplementation(async (path: string) =>
    path.endsWith("/money") ? { teamMoney: -50 } : []);
  const client = renderDialog();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Build" })); });
  fireEvent.click(screen.getByRole("checkbox", { name: /Non-negative balance at kickoff/ }));

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Build" })); });

  expect(screen.queryByText(/Confirm the suggested sales to reach 0/)).toBeNull();
  expect(screen.getByText("Previous results are stale. Rebuild before applying a draft.")).toBeTruthy();
  client.clear();
});
