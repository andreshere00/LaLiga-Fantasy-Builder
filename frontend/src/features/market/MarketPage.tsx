import { useDeferredValue, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { useNow } from "../../hooks/useNow";
import { useRetained } from "../../hooks/useRetained";
import { GatePanel } from "../gates/GatePanel";
import { BidDialog } from "./actions/BidDialog";
import { ClauseDialog } from "./actions/ClauseDialog";
import { WithdrawDialog } from "./actions/WithdrawDialog";
import { useMarketActions } from "./actions/useMarketActions";
import { marketColumnHeadings } from "./marketColumnHeadings";
import { MarketListHead } from "./MarketListHead";
import { MarketRowCells } from "./MarketRowView";
import { MARKET_CLEAR_FILTERS_LABEL, MARKET_SEARCH_NO_MATCHES } from "./marketMessages";
import {
  activeFilterCount,
  applyMarketFilters,
  createEmptyMarketFilters,
  sellerOptions,
} from "./marketFilters";
import { MarketMotionProvider, MarketRowMotion } from "./MarketRowMotion";
import { MarketToolbar } from "./MarketToolbar";
import { useMarketBoard } from "./useMarketBoard";
import "./MarketPage.css";

function MarketList() {
  const board = useMarketBoard();
  const [filters, setFilters] = useState(createEmptyMarketFilters);
  const deferredFilters = useDeferredValue(filters);
  const now = useNow();
  const visibleRows = useMemo(
    () => applyMarketFilters(board.rows, deferredFilters),
    [board.rows, deferredFilters],
  );
  const filterCount = useMemo(() => activeFilterCount(filters), [filters]);
  const columnHeadings = useMemo(
    () => marketColumnHeadings(deferredFilters),
    [deferredFilters],
  );
  const sellers = useMemo(() => sellerOptions(board.rows), [board.rows]);
  const marketActions = useMarketActions();
  const bid = useRetained(marketActions.pendingBid);
  const clause = useRetained(marketActions.pendingClause);
  const withdraw = useRetained(marketActions.pendingWithdraw);
  const actionContext = {
    money: board.money,
    now,
    callerTeamId: board.callerTeamId,
    squadPlayerCount: board.squadPlayerCount,
    activeBidCount: board.activeBidCount,
    squadMarketValue: board.squadMarketValue,
  };

  const dialogOpen =
    marketActions.pendingBid != null ||
    marketActions.pendingClause != null ||
    marketActions.pendingWithdraw != null;

  const clearFilters = () => {
    setFilters(createEmptyMarketFilters());
  };

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
    <MarketMotionProvider>
      <MarketToolbar
        money={board.money}
        showSearch={board.rows.length > 0}
        filters={filters}
        onFiltersChange={setFilters}
        activeFilterCount={filterCount}
        onClearFilters={clearFilters}
      />
      {board.isDegraded ? (
        <p className="market-notice status-copy" role="status">
          Some market details could not be loaded. Balance, squad data, value changes and last
          performances may be incomplete, and some actions may be unavailable.
        </p>
      ) : null}
      {marketActions.message && !dialogOpen ? (
        <p className="status-copy" role="alert">
          {marketActions.message}
        </p>
      ) : null}
      {board.rows.length === 0 ? (
        <p className="status-copy">No players on the market.</p>
      ) : visibleRows.length === 0 ? (
        <div className="market-empty-filters" role="status">
          <p className="status-copy">{MARKET_SEARCH_NO_MATCHES}</p>
          {filterCount > 0 ? (
            <button type="button" className="market-filter-clear-main" onClick={clearFilters}>
              {MARKET_CLEAR_FILTERS_LABEL}
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="market-list">
          <MarketListHead
            headings={columnHeadings}
            filters={filters}
            sellers={sellers}
            onFiltersChange={setFilters}
          />
          {visibleRows.map((row, order) => (
            <MarketRowMotion key={row.id} order={order}>
              <MarketRowCells
                row={row}
                now={now}
                actionContext={actionContext}
                actions={marketActions}
                columnHeadings={columnHeadings}
              />
            </MarketRowMotion>
          ))}
        </ul>
      )}
      <BidDialog
        open={marketActions.pendingBid != null}
        row={bid?.row ?? null}
        kind={bid?.kind ?? null}
        money={board.money}
        squadMarketValue={board.squadMarketValue}
        initialAmount={bid?.initialAmount ?? null}
        pending={marketActions.actionPending}
        error={marketActions.message}
        onClose={marketActions.closeBid}
        onConfirm={marketActions.submitBid}
      />
      <WithdrawDialog
        open={marketActions.pendingWithdraw != null}
        row={withdraw}
        pending={marketActions.actionPending}
        error={marketActions.message}
        onClose={marketActions.closeWithdraw}
        onConfirm={marketActions.confirmWithdraw}
      />
      <ClauseDialog
        open={marketActions.pendingClause != null}
        row={clause?.row ?? null}
        amount={clause?.amount ?? 0}
        pending={marketActions.actionPending}
        error={marketActions.message}
        onClose={marketActions.closeClause}
        onConfirm={marketActions.confirmClause}
      />
    </MarketMotionProvider>
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
