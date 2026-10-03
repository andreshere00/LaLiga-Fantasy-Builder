import { useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { useNow } from "../../hooks/useNow";
import { GatePanel } from "../gates/GatePanel";
import { BidDialog } from "./actions/BidDialog";
import { ClauseDialog } from "./actions/ClauseDialog";
import { useMarketActions } from "./actions/useMarketActions";
import { MarketRowView } from "./MarketRowView";
import { MARKET_SEARCH_NO_MATCHES } from "./marketMessages";
import { filterMarketRowsBySearch } from "./marketSearch";
import { MarketToolbar } from "./MarketToolbar";
import { useMarketBoard } from "./useMarketBoard";
import "./MarketPage.css";

function MarketList() {
  const board = useMarketBoard();
  const [playerSearch, setPlayerSearch] = useState("");
  const now = useNow();
  const visibleRows = useMemo(
    () => filterMarketRowsBySearch(board.rows, playerSearch),
    [board.rows, playerSearch],
  );
  const marketActions = useMarketActions();
  const actionContext = {
    money: board.money,
    now,
    callerTeamId: board.callerTeamId,
    squadPlayerCount: board.squadPlayerCount,
    activeBidCount: board.activeBidCount,
    squadMarketValue: board.squadMarketValue,
  };

  const dialogOpen = marketActions.pendingBid != null || marketActions.pendingClause != null;

  if (board.isLoading) return <p className="status-copy">Loading market…</p>;
  if (board.noLeague) return <p className="status-copy">No leagues found for this account.</p>;
  if (board.hasError) {
    return (
      <p className="status-copy" role="alert">
        The market could not be loaded.
      </p>
    );
  }

  return (
    <>
      <MarketToolbar
        money={board.money}
        showSearch={board.rows.length > 0}
        playerSearch={playerSearch}
        onPlayerSearchChange={setPlayerSearch}
      />
      {board.isDegraded ? (
        <p className="market-notice status-copy" role="status">
          Some market details could not be loaded. Balance, squad data, value changes and
          last performances may be incomplete, and some actions may be unavailable.
        </p>
      ) : null}
      {marketActions.message && !dialogOpen ? (
        <p className="status-copy" role="alert">
          {marketActions.message}
        </p>
      ) : null}
      {board.rows.length === 0 ? (
        <p className="status-copy">No players on the market.</p>
      ) : (
        <>
          {visibleRows.length === 0 ? (
            <p className="status-copy" role="status">
              {MARKET_SEARCH_NO_MATCHES}
            </p>
          ) : (
            <ul className="market-list">
              <li className="market-row market-head" aria-hidden="true">
                <span className="market-head-player">Player</span>
                <span>Position</span>
                <span>FSYP</span>
                <span>Form</span>
                <span>Market value</span>
                <span>Availability</span>
                <span>Seal end</span>
                <span>Sell options</span>
              </li>
              {visibleRows.map((row) => (
                <MarketRowView
                  key={row.id}
                  row={row}
                  now={now}
                  actionContext={actionContext}
                  actions={marketActions}
                />
              ))}
            </ul>
          )}
        </>
      )}
      <BidDialog
        open={marketActions.pendingBid != null}
        row={marketActions.pendingBid?.row ?? null}
        kind={marketActions.pendingBid?.kind ?? null}
        money={board.money}
        squadMarketValue={board.squadMarketValue}
        initialAmount={marketActions.pendingBid?.initialAmount ?? null}
        pending={marketActions.actionPending}
        error={marketActions.message}
        onClose={marketActions.closeBid}
        onConfirm={marketActions.submitBid}
      />
      <ClauseDialog
        open={marketActions.pendingClause != null}
        row={marketActions.pendingClause?.row ?? null}
        amount={marketActions.pendingClause?.amount ?? 0}
        pending={marketActions.actionPending}
        error={marketActions.message}
        onClose={marketActions.closeClause}
        onConfirm={marketActions.confirmClause}
      />
    </>
  );
}

export function MarketPage() {
  const { status } = useAuth();
  if (status !== "ready") return <GatePanel status={status} />;
  return (
    <section className="market-page">
      <MarketList />
    </section>
  );
}
