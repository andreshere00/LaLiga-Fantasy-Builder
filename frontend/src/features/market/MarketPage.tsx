import { useDeferredValue, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { favoriteMarketRowClass, readFavoritePlayerIds } from "../players/favorites";
import { useNow } from "../../hooks/useNow";
import { GatePanel } from "../gates/GatePanel";
import { MarketActionDialogs } from "./actions/MarketActionDialogs";
import { useMarketActions } from "./actions/useMarketActions";
import { marketColumnHeadings } from "./marketColumnHeadings";
import { MarketListHead } from "./MarketListHead";
import { MarketRowCells } from "./MarketRowView";
import { MarketScreenLoading } from "./MarketScreenLoading";
import { MARKET_CLEAR_FILTERS_LABEL, MARKET_SEARCH_NO_MATCHES } from "./marketMessages";
import {
  activeFilterCount,
  applyMarketFilters,
  createEmptyMarketFilters,
  sellerOptions,
} from "./marketFilters";
import { RichRow } from "../../components/ui/RichRow";
import { MarketToolbar } from "./MarketToolbar";
import { useMarketBoard } from "./useMarketBoard";
import "./MarketPage.css";

function MarketList() {
  const { user } = useAuth();
  const board = useMarketBoard();
  const favorites = useMemo(
    () => readFavoritePlayerIds(user?.userId ?? null),
    [user?.userId],
  );
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

  if (board.isLoading) return <MarketScreenLoading />;
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
        filters={filters}
        onFiltersChange={setFilters}
        activeFilterCount={filterCount}
        onClearFilters={clearFilters}
        suggestions={board.rows.map((row) => row.name)}
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
            names={board.rows.map((row) => row.name)}
            onFiltersChange={setFilters}
          />
          {visibleRows.map((row) => (
            <RichRow
              key={row.id}
              className={favoriteMarketRowClass(row.playerId, favorites)}
            >
              <MarketRowCells
                row={row}
                now={now}
                actionContext={actionContext}
                actions={marketActions}
                columnHeadings={columnHeadings}
              />
            </RichRow>
          ))}
        </ul>
      )}
      <MarketActionDialogs
        actions={marketActions}
        money={board.money}
        squadMarketValue={board.squadMarketValue}
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
