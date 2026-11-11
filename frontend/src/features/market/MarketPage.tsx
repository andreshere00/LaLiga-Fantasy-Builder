import { t, useTranslation } from "../../i18n";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { ScoutingPanel } from "../scouting/ScoutingPanel";
import { useScouting } from "../scouting/ScoutingProvider";
import { leagueId } from "../../api/mappers";
import { useLeague } from "../lineup/LeagueProvider";
import { MarketBids } from "./bids/MarketBids";
import { favoriteMarketRowClass } from "../players/favorites";
import { useNow } from "../../hooks/useNow";
import { GatePanel } from "../gates/GatePanel";
import { MarketActionDialogs } from "./actions/MarketActionDialogs";
import { useMarketActions } from "./actions/useMarketActions";
import { marketColumnHeadings } from "./marketColumnHeadings";
import { MarketListHead } from "./MarketListHead";
import { MarketRowCells } from "./MarketRowView";
import { PositionFilterContext } from "./cells/positionFilter";
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
import "../../components/ui/ComparisonList.css";
import { MarketOffers } from "./offers/MarketOffers";
import { MarketOffersProvider } from "./offers/MarketOffersContext";

function MarketList() {
  const { selected } = useLeague();
  return <MarketOffersProvider><MarketListContent key={selected ? leagueId(selected) : ""} /></MarketOffersProvider>;
}

function MarketListContent() {
  useTranslation();
  const scouting = useScouting();
  const board = useMarketBoard();
  const favorites = scouting.favorites;
  const [filters, setFilters] = useState(createEmptyMarketFilters);
  const deferredFilters = useDeferredValue(filters);
  const [tickMs, setTickMs] = useState(60_000);
  const now = useNow(tickMs);
  const visibleRows = useMemo(
    () => applyMarketFilters(board.rows, deferredFilters),
    [board.rows, deferredFilters],
  );
  useEffect(() => {
    const soon = visibleRows.some((row) => {
      if (row.expiresAt == null) return false;
      const left = row.expiresAt - Date.now();
      return left > 0 && left <= 2 * 60_000;
    });
    setTickMs(soon ? 1_000 : 60_000);
  }, [visibleRows, now]);
  const filterCount = useMemo(() => activeFilterCount(filters), [filters]);
  const positionFilter = useMemo(() => ({
    selected: filters.positions,
    onFilter: (positions: ReadonlySet<number>) => setFilters((current) => ({ ...current, positions })),
  }), [filters.positions]);
  const columnHeadings = marketColumnHeadings(deferredFilters);
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

  if (board.noLeague) return <p className="status-copy">{t("No leagues found for this account.")}</p>;

  return (
    <>
      <MarketToolbar
        money={board.money}
        projection={board.projection}
        projectionRefreshing={board.projectionRefreshing}
        projectionStale={board.projectionStale}
        showSearch={board.rows.length > 0}
        filters={filters}
        onFiltersChange={setFilters}
        activeFilterCount={filterCount}
        onClearFilters={clearFilters}
        suggestions={board.rows.map((row) => row.name)}
        notifications={<><ScoutingPanel /><MarketOffers cards={board.ownSquadCards}
          squadAvailable={board.ownSquadAvailable} />
          <MarketBids board={board} actions={marketActions} now={now} /></>}
      />
      {!board.isLoading && !board.hasError && board.rows.length > 0 ? <div className="market-results-summary">
        <p role="status">{visibleRows.length} {t(" of ")}{board.rows.length} {t(" players")}{filterCount > 0 ? t(" · Filters active") : t(" available")}</p>
        <span>{t("Form: oldest → latest")}</span>
      </div> : null}
      {board.isDegraded ? (
        <p className="market-notice status-copy" role="status">
          {t("Some market details could not be loaded. Balance, squad data, value changes and last performances may be incomplete, and some actions may be unavailable.")}</p>
      ) : null}
      {marketActions.message && !dialogOpen ? (
        <p className="status-copy" role="alert">
          {t(marketActions.message)}
        </p>
      ) : null}
      {board.isLoading ? <MarketScreenLoading tableOnly /> : board.hasError ? (
        <p className="status-copy" role="alert">{t("The market could not be loaded. Refresh bids to retry.")}</p>
      ) : board.rows.length === 0 ? (
        <p className="status-copy">{t("No players on the market.")}</p>
      ) : visibleRows.length === 0 ? (
        <div className="market-empty-filters" role="status">
          <p className="status-copy">{t(MARKET_SEARCH_NO_MATCHES)}</p>
          {filterCount > 0 ? (
            <button type="button" className="market-filter-clear-main" onClick={clearFilters}>
              {t(MARKET_CLEAR_FILTERS_LABEL)}
            </button>
          ) : null}
        </div>
      ) : (
        <PositionFilterContext.Provider value={positionFilter}>
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
        </PositionFilterContext.Provider>
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
    <section className="market-page comparison-page">
      <MarketList />
    </section>
  );
}
