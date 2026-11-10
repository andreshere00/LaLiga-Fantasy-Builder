import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getJson = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()), getJson,
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ accessToken: "jwt", user: { userId: "u1" } }),
}));
vi.mock("../features/lineup/LeagueProvider", () => ({
  useLeague: () => ({ selected: { id: "L1" } }),
}));

import { useRoutePrefetch } from "./useRoutePrefetch";

afterEach(() => { cleanup(); getJson.mockClear(); });

function Link({ to }: { to: string }) {
  const handlers = useRoutePrefetch();
  return <a href={to} {...handlers(to)}>{to}</a>;
}

function setup(to: string) {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><Link to={to} /></QueryClientProvider>);
  return client;
}

describe("useRoutePrefetch", () => {
  it("hoverMarket_fetchesMarketAndLeagueTeamsIntoTheScreensCacheKeys", async () => {
    const client = setup("/market");

    fireEvent.pointerEnter(screen.getByRole("link"));

    await waitFor(() => expect(client.getQueryData(["market", "L1"])).toBeDefined());
    expect(client.getQueryData(["league-teams", "L1"])).toBeDefined();
  });

  it("focusPlayers_fetchesCatalog", async () => {
    const client = setup("/players");

    fireEvent.focus(screen.getByRole("link"));

    await waitFor(() => expect(client.getQueryData(["players", "catalog"])).toBeDefined());
  });

  it("lineupLink_hasNoHandlersAndFetchesNothing", () => {
    setup("/");

    fireEvent.pointerEnter(screen.getByRole("link"));

    expect(getJson).not.toHaveBeenCalled();
  });
});
