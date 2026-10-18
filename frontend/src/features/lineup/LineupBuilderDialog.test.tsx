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
