import { useQueries } from "@tanstack/react-query";
import { getJson, paths } from "../../api/client";
import { asRecord, idText, leagueId, playersOf } from "../../api/mappers";
import { useReauthOnError } from "../../api/queries";
import type { BuilderCandidate } from "../../api/schemas";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { useNow } from "../../hooks/useNow";
import { MarketActionDialogs } from "../market/actions/MarketActionDialogs";
import { resolveMarketActionOffers, squadSlotAvailableForNewBid } from "../market/actions/marketActions";
import { useMarketActions } from "../market/actions/useMarketActions";
import { marketRow } from "../market/model/row";
import { useMarketBoard } from "../market/useMarketBoard";
import { useLeague } from "./LeagueProvider";
import "../market/MarketPage.css";

/** Resolve current acquisition identifiers and reuse explicit market confirmations. */
export function LineupBuilderPlayerActions({ player, opponentTeamIds, clausesDeadline, onClose, onSuccess }: {
  player: BuilderCandidate["starters"][number];
  opponentTeamIds: readonly string[];
  clausesDeadline: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const board = useMarketBoard();
  const actions = useMarketActions(onSuccess);
  const now = useNow();
  const { accessToken } = useAuth();
  const { selected } = useLeague();
  const id = selected ? leagueId(selected) : "";
  const listed = board.rows.find((row) => row.playerId === player.playerId &&
    (player.source === "opponents" ? row.sellerKind === "opponent" : row.sellerKind === "laliga"));
  const teamIds = [...new Set(listed?.sellerTeamId ? [listed.sellerTeamId] : opponentTeamIds)]
    .filter((teamId) => teamId !== board.callerTeamId);
  const rosters = useQueries({ queries: teamIds.map((teamId) => ({
    queryKey: ["team", id, teamId],
    enabled: player.source === "opponents" && !!accessToken && !!id,
    staleTime: 0,
    queryFn: ({ signal }: { signal: AbortSignal }) => getJson(paths.team(id, teamId), accessToken ?? "", { signal }),
  })) });
  useReauthOnError(rosters.map((query) => query.error));
  let opponentSlot: Record<string, unknown> | null = null;
  let ownerTeamId: string | null = null;
  for (const [index, query] of rosters.entries()) {
    const slots = playersOf(query.data);
    if (!Array.isArray(slots) || query.isError || query.isFetching) continue;
    const slot = slots.map(asRecord).find((slot) =>
      idText(asRecord(slot?.playerMaster)?.id) === player.playerId &&
      idText(slot?.playerTeamId) === player.playerTeamId);
    if (slot) { opponentSlot = slot; ownerTeamId = teamIds[index]; break; }
  }
  const opponentRow = opponentSlot ? marketRow({
    playerMaster: opponentSlot.playerMaster,
    playerTeam: opponentSlot,
    sellerTeam: { id: ownerTeamId, manager: { managerName: "Opponent" } },
    directOffer: true,
  }, 0, { catalog: new Map(), history: new Map(), callerTeamId: board.callerTeamId }) : null;
  // A direct offer targets the current squad entry, independently of a market bid.
  const row = player.source === "opponents" ? opponentRow : listed;
  const owned = board.ownSquadCards.some((card) => card.masterPlayerId === player.playerId);
  const context = {
    money: board.money, now, callerTeamId: board.callerTeamId,
    squadPlayerCount: board.squadPlayerCount, activeBidCount: board.activeBidCount,
    squadMarketValue: board.squadMarketValue,
  };
  const offers = row && !owned ? resolveMarketActionOffers(row, context)
    .filter((offer) => offer.type === "bid" || offer.type === "pay-clause")
    .map((offer) => {
      if (offer.type === "bid") return { ...offer,
        label: player.source === "opponents" ? "Make offer" : offer.kind === "modify" ? "Modify bid" : "Place bid" };
      const buyouts = selected?.config?.features?.buyoutClause;
      const deadline = Date.parse(clausesDeadline);
      const blocked = buyouts !== true
        ? buyouts === false ? "Release-clause purchases are disabled in this league." : "League buyout settings could not be verified."
        : typeof opponentSlot?.isShielded !== "boolean" ? "The player's shield status could not be verified."
          : !squadSlotAvailableForNewBid(context) ? "Your squad has no verified space for another player, including pending bids."
            : !Number.isFinite(deadline) || now >= deadline ? "The release-clause acquisition window is closed or could not be verified." : null;
      if (blocked) return { ...offer, enabled: false, disabledReason: blocked };
      return offer;
    }) : [];
  const confirming = actions.pendingBid != null || actions.pendingClause != null;
  const loading = board.isLoading || (player.source === "opponents" && rosters.some((query) => query.isFetching));
  return <>
    <Dialog open={!confirming} title={`${player.name} — Acquisition options`} onClose={onClose}
      closeOnBackdrop={!actions.actionPending}
      className="lineup-builder-dialog" footer={<Button variant="secondary" shape="square" onClick={onClose}>Close</Button>}>
      {loading ? <p role="status">Checking current acquisition options…</p> : owned ? <p>This player is already in your squad. Rebuild to update the recommendation.</p>
        : offers.length === 0 ? <p role="status">No verified acquisition route is currently available. Refresh your league and try again.</p>
          : <div className="lineup-builder-section">{offers.map((offer) => <div key={offer.type}>
            <Button shape="square" disabled={!offer.enabled || actions.actionPending} onClick={() => {
              if (!row || !offer.enabled) return;
              if (offer.type === "bid") actions.openBid(row, offer.kind);
              else actions.openClause(row, offer.amount);
            }}>{offer.label}</Button>
            {offer.disabledReason && <p className="fb-helper">{offer.disabledReason}</p>}
          </div>)}</div>}
      {actions.message && <p role="alert">{actions.message}</p>}
    </Dialog>
    <MarketActionDialogs actions={actions} money={board.money} squadMarketValue={board.squadMarketValue} />
  </>;
}
