import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SquadCard } from "../../api/mappers";
import { formatEuro } from "../../api/format";
import { SquadPlayerActions } from "./SquadPlayerActions";
import type { SquadSalesApi } from "./useSquadSales";

afterEach(cleanup);

const mutation = () => ({ isPending: false, error: null, reset: vi.fn(), mutate: vi.fn() });
const sales = {
  listPlayer: mutation(),
  modifyListing: mutation(),
  cancelListing: mutation(),
  sellImmediately: mutation(),
} as unknown as SquadSalesApi;

const player: SquadCard = {
  id: "entry-7",
  masterPlayerId: "53",
  name: "Ionut Radu",
  captain: false,
  positionId: 1,
  photoUrl: null,
  teamBadgeUrl: null,
  marketValue: 4_000_000,
  onMarket: false,
  listingId: null,
  salePrice: null,
};

function openOptions(card: SquadCard = player, onSwap = vi.fn()) {
  render(
    <MemoryRouter>
      <SquadPlayerActions player={card} sales={sales} cardMenu onSwap={onSwap}>
        {(open) => <button type="button" onClick={open}>open</button>}
      </SquadPlayerActions>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "open" }));
  return screen.getByRole("dialog");
}

describe("SquadPlayerActions", () => {
  it("options_eachChoice_hasOwnNameHintAndDestination", () => {
    const dialog = openOptions();

    const market = within(dialog).getByRole("button", { name: "Market options" });
    const details = within(dialog).getByRole("link", { name: "Player details" });
    const swap = within(dialog).getByRole("button", { name: "Swap player" });

    expect(market.getAttribute("aria-describedby")).toBeTruthy();
    expect(details.getAttribute("href")).toBe("/players/53");
    expect(swap.className).toContain("player-action--lineup");
    expect(within(dialog).getByText("Goalkeeper · Value " + formatEuro(4_000_000))).toBeTruthy();
  });

  it("options_knownCrest_linksToTeamPage", () => {
    const badge = "https://assets-fantasy.llt-services.com/teambadge/t1564/color/t1564_ud-almeria.png";
    const dialog = openOptions({ ...player, teamBadgeUrl: badge });

    const team = within(dialog).getByRole("link", { name: "Team page" });

    expect(team.getAttribute("href")).toBe("/teams/1");
  });

  it("options_unknownCrest_hidesTeamPage", () => {
    const dialog = openOptions();

    expect(within(dialog).queryByRole("link", { name: "Team page" })).toBeNull();
  });

  it("marketChoice_unlistedPlayer_showsPricesInHints", () => {
    const dialog = openOptions();

    fireEvent.click(within(dialog).getByRole("button", { name: "Market options" }));

    expect(screen.getByText("Set your price, from " + formatEuro(4_000_000))).toBeTruthy();
    expect(screen.getByText("Sell now for " + formatEuro(2_000_000))).toBeTruthy();
  });

  it("marketChoice_listedPlayer_blocksImmediateSaleWithReason", () => {
    const dialog = openOptions({ ...player, onMarket: true, listingId: "m1", salePrice: 5_000_000 });

    expect(within(dialog).getByText("Listed · " + formatEuro(5_000_000))).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Market options" }));

    const sell = screen.getByRole("button", { name: "Sell immediately to market" });
    expect(sell.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Withdraw the listing first")).toBeTruthy();
  });

  it("swapChoice_clicked_closesAndStartsSwap", () => {
    const onSwap = vi.fn();
    const dialog = openOptions(player, onSwap);

    fireEvent.click(within(dialog).getByRole("button", { name: "Swap player" }));

    expect(onSwap).toHaveBeenCalledOnce();
  });
});
