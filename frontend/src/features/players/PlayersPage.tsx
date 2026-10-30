import { ManagerIdentity } from "../shell/ManagerIdentity";
import { Menu } from "@base-ui/react/menu";
import { formatEuro } from "../../api/format";
import { leagueId } from "../../api/mappers";
import { Help } from "../../components/ui/Help";
import shieldRedIcon from "../../assets/button_shield_red.svg";
import { useQueries } from "@tanstack/react-query";
import { NumberPagination } from "../../components/ui/NumberPagination";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getJson, paths } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useNow } from "../../hooks/useNow";
import { GatePanel } from "../gates/GatePanel";
import { SquadPlayerActions } from "../lineup/SquadPlayerActions";
import { useSquadSales } from "../lineup/useSquadSales";
import { useLeague } from "../lineup/LeagueProvider";
import { AvailabilityCell } from "../market/cells/AvailabilityCell";
import { FormCell } from "../market/cells/FormCell";
import { FsypCell } from "../market/cells/FsypCell";
import { PositionCell } from "../market/cells/PositionCell";
import { ValueCell } from "../market/cells/ValueCell";
import { ReleaseClauseDetail } from "../market/cells/ReleaseClauseDetail";
import { protectionDescription } from "../market/model/protection";
import { PlayerTile } from "../lineup/PlayerTile";
import { MarketActionDialogs } from "../market/actions/MarketActionDialogs";
import { MarketActionMenu } from "../market/actions/MarketActionMenu";
import { useMarketActions } from "../market/actions/useMarketActions";
import type { MarketActionContext } from "../market/actions/marketActions";
import type { MarketRow } from "../market/model/row";
import {
  valueSeries,
  valueVariation,
  valueVariationPercent,
  type ValuePoint,
} from "../market/model/valueSeries";
import { RichRow } from "../../components/ui/RichRow";
import { useMarketBoard } from "../market/useMarketBoard";
import type { SquadCard } from "../../api/mappers";
import { MarketPlayerSearch } from "../market/MarketPlayerSearch";
import availableIcon from "../../assets/button_available.svg";
import { PlayerBookmarkButton } from "./PlayerBookmarkButton";
import { PlayersScreenLoading } from "./PlayerScreenLoading";
import {
  activePlayersFilterCount,
  applyPlayersFilters,
  ownerOptions,
  PLAYERS_LEADERBOARD_SIZE,
  PLAYERS_PAGE_SIZE,
} from "./playersFilters";
import { playersColumnHeadings } from "./playersColumnHeadings";
import { PlayersListHead } from "./PlayersListHead";
import { MarketOffers } from "../market/offers/MarketOffers";
import { MarketOffersProvider } from "../market/offers/MarketOffersContext";
import { readFavoritePlayerIds, toggleFavoritePlayerId } from "./favorites";
import type { PlayerRow } from "./model/playerRow";
import { matchingPlayerListing, playerClauseDetails } from "./model/playerMarketDetails";
import {
  createEmptyPlayersFilters,
  isPlayersLeaderboardView,
  clampPlayersPage,
  parsePlayersSearchParams,
  serializePlayersSearchParams,
  withPlayersFilters,
  withPlayersPage,
  type PlayersFilters,
} from "./playersSearchParams";
import { usePlayersBoard } from "./usePlayersBoard";
import "../../components/ui/RichList.css";
import "./PlayersPage.css";
import "../../components/ui/ComparisonList.css";

function PlayersListRow({
  row,
  favorite,
  marketRow,
  valueHistory,
  ownSquadCard,
  actionContext,
  actions,
  sales,
  onToggleFavorite,
}: {
  row: PlayerRow;
  favorite: boolean;
  marketRow: MarketRow | null;
  valueHistory: readonly ValuePoint[];
  ownSquadCard: SquadCard | null;
  actionContext: MarketActionContext;
  actions: ReturnType<typeof useMarketActions>;
  sales: ReturnType<typeof useSquadSales>;
  onToggleFavorite: () => void;
}) {
  const clause = playerClauseDetails(row, marketRow);
  const listingForActions = marketRow ? { ...marketRow, ...clause, isShielded: clause.isShielded === true } : null;
  const protection = protectionDescription(clause, actionContext.now);
  const nameClass = "market-name" + (protection ? " is-protected" : "");
  const moneyDetails = <>
    {marketRow?.myBid ? <span className="market-bid-value">
      Your bid: {formatEuro(marketRow.myBid.money)}
    </span> : null}
    <ReleaseClauseDetail row={clause} now={actionContext.now} />
  </>;
  const formRow = {
    id: row.playerId,
    formRecent: row.formRecent,
    formRecentWeeks: row.formRecentWeeks,
    pendingFormWeek: row.pendingFormWeek,
  };
  const rowClass = favorite
    ? "players-row is-favorite"
    : "players-row";
  const ownerCell = row.ownedBy === "Free Agent" ? (
    <span className="players-free-agent">
      <img src={availableIcon} alt="" aria-hidden="true" />
      Free Agent
    </span>
  ) : row.ownerTeamId ? (
    <Link className="players-owner-link" to={`/?team=${encodeURIComponent(row.ownerTeamId)}`}>
      <ManagerIdentity name={row.ownedBy} avatarUrl={row.ownerAvatarUrl} />
    </Link>
  ) : (
    row.ownedBy
  );
  const detailsOptions = row.positionId === 5 ? null : (
    <Menu.Root>
      <Menu.Trigger className="market-actions-trigger">Options</Menu.Trigger>
      <Menu.Portal><Menu.Positioner align="end" sideOffset={4} className="fb-menu-positioner">
        <Menu.Popup className="fb-menu-popup">
          <Menu.Item className="market-actions-item" render={<Link
            to={"/players/" + encodeURIComponent(row.playerId)} state={{ returnTo: "/players" }} />}>
            Player details
          </Menu.Item>
        </Menu.Popup>
      </Menu.Positioner></Menu.Portal>
    </Menu.Root>
  );
  return (
    <RichRow
      className={rowClass}
    >
      <div className="market-card">
        <PlayerTile
          name={row.name}
          captain={false}
          variant="squad"
          showName={false}
          photoUrl={row.photoUrl}
          photoFallbackUrls={row.photoFallbackUrl ? [row.photoFallbackUrl] : []}
          teamBadgeUrl={row.teamBadgeUrl}
        />
      </div>
      <span className="market-name-wrap" data-label="Player">
        {row.positionId === 5 ? <span className={nameClass}>{row.name}</span> : (
          <Link className={nameClass + " players-name-link"} to={"/players/" + encodeURIComponent(row.playerId)} state={{ returnTo: "/players" }}>{row.name}</Link>
        )}
        {protection ? <Help content={protection} className="market-clause-flag">
          <img className="market-clause-flag-icon" src={shieldRedIcon} alt={protection} />
        </Help> : null}
      </span>
      <span className="market-cell players-team-cell" data-label="Team">{row.teamName ?? "—"}</span>
      <span className="market-cell" data-label="Position">
        <PositionCell positionId={row.positionId} />
      </span>
      <span className="market-cell market-fsyp-cell" data-label="FSYP">
        <FsypCell
          labelAverage
          points={row.points}
          averagePoints={row.averagePoints}
          formRecent={row.formRecent}
        />
      </span>
      <span className="market-cell market-form" data-label="Form">
        <FormCell row={formRow} windowSize={5} />
      </span>
      <span className="market-cell market-value players-value-cell" data-label="Market value">
        <ValueCell
          marketValue={row.marketValue}
          variation={valueVariation(valueHistory)}
          variationPercent={valueVariationPercent(valueHistory)}
          valueHistory={valueHistory}
        />
        <span className="players-value-details">{moneyDetails}</span>
      </span>
      <span className="market-cell market-cell-availability" data-label="Availability">
        <AvailabilityCell availability={row.availability} />
      </span>
      <span className="market-cell players-owner-cell" data-label="Owned by" title={row.ownedBy}>
        {ownerCell}
      </span>
      <span className="market-cell players-actions-cell" data-label="Actions">
        <span className="players-action-controls">
          {ownSquadCard ? (
            <SquadPlayerActions
              player={ownSquadCard}
              sales={sales}
              triggerText="Options"
              detailsReturnTo="/players"
            >
              <span className="players-squad-actions-target" aria-hidden="true" />
            </SquadPlayerActions>
          ) : listingForActions ? (
            <MarketActionMenu
              row={listingForActions}
              context={actionContext}
              actions={actions}
              detailsPlayer={row.positionId === 5 ? undefined : { id: row.playerId, name: row.name }}
              detailsReturnTo="/players"
            />
          ) : (
            detailsOptions
          )}
          <PlayerBookmarkButton
            pressed={favorite}
            playerName={row.name}
            onToggle={onToggleFavorite}
          />
        </span>
        {marketRow ? <span className="market-bid-count">Bids: {marketRow.numberOfBids ?? 0}</span> : null}
        <span className="players-mobile-value-details">{moneyDetails}</span>
      </span>
    </RichRow>
  );
}

function PlayersList() {
  const { selected } = useLeague();
  return <MarketOffersProvider key={selected ? leagueId(selected) : ""}>
    <PlayersListContent />
  </MarketOffersProvider>;
}

function PlayersListContent() {
  const board = usePlayersBoard();
  const marketBoard = useMarketBoard();
  const actions = useMarketActions();
  const sales = useSquadSales();
  const now = useNow();
  const { user, accessToken } = useAuth();
  const userId = user?.userId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(
    () => parsePlayersSearchParams(searchParams),
    [searchParams],
  );
  const [favorites, setFavorites] = useState(() => readFavoritePlayerIds(userId));

  const filtered = useMemo(
    () => applyPlayersFilters(board.rows, urlState.filters),
    [board.rows, urlState.filters],
  );

  const leaderboard = isPlayersLeaderboardView(urlState.filters);
  const totalPages = leaderboard
    ? 1
    : Math.max(1, Math.ceil(filtered.length / PLAYERS_PAGE_SIZE));
  const currentPage = leaderboard ? 1 : clampPlayersPage(urlState.page, totalPages);
  const visibleRows = useMemo(() => {
    if (leaderboard) return filtered.slice(0, PLAYERS_LEADERBOARD_SIZE);
    const start = (currentPage - 1) * PLAYERS_PAGE_SIZE;
    return filtered.slice(start, start + PLAYERS_PAGE_SIZE);
  }, [currentPage, filtered, leaderboard]);
  const valueHistories = useQueries({
    queries: visibleRows.map((row) => ({
      queryKey: ["players", "market-value", row.playerId],
      enabled: accessToken != null,
      staleTime: 5 * 60_000,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerMarketValue(row.playerId), accessToken ?? "", { signal }),
    })),
  });
  const valueHistoryByPlayer = new Map(
    visibleRows.map((row, index) => [
      row.playerId,
      valueSeries(valueHistories[index]?.data),
    ]),
  );
  const filterCount = activePlayersFilterCount(urlState.filters);
  const columnHeadings = useMemo(
    () => playersColumnHeadings(urlState.filters),
    [urlState.filters],
  );
  const owners = useMemo(() => ownerOptions(board.rows), [board.rows]);
  const teams = useMemo(
    () => [...new Set(board.rows.map((row) => row.teamName).filter((name): name is string => name != null))]
      .sort((left, right) => left.localeCompare(right, "es")),
    [board.rows],
  );
  const marketRowsByPlayer = useMemo(() => {
    const rows = new Map<string, MarketRow>();
    for (const marketRow of marketBoard.rows) {
      if (marketRow.playerId && !rows.has(marketRow.playerId)) {
        rows.set(marketRow.playerId, marketRow);
      }
    }
    return rows;
  }, [marketBoard.rows]);
  const ownSquadByPlayer = useMemo(
    () =>
      new Map(
        marketBoard.ownSquadCards
          .filter((player) => player.masterPlayerId != null)
          .map((player) => [player.masterPlayerId as string, player]),
      ),
    [marketBoard.ownSquadCards],
  );
  const actionContext: MarketActionContext = {
    money: marketBoard.money,
    now,
    callerTeamId: marketBoard.callerTeamId,
    squadPlayerCount: marketBoard.squadPlayerCount,
    activeBidCount: marketBoard.activeBidCount,
    squadMarketValue: marketBoard.squadMarketValue,
  };
  const dialogOpen =
    actions.pendingBid != null ||
    actions.pendingClause != null ||
    actions.pendingWithdraw != null;

  const setFilters = useCallback(
    (patch: Partial<PlayersFilters>) => {
      setSearchParams(withPlayersFilters(searchParams, patch), { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearFilters = () => {
    setSearchParams(serializePlayersSearchParams({ filters: createEmptyPlayersFilters(), page: null }), {
      replace: true,
    });
  };

  const toggleFavorite = (playerId: string) => {
    setFavorites(toggleFavoritePlayerId(userId, playerId));
  };

  if (board.isLoading) return <PlayersScreenLoading />;
  if (board.noLeague) return <p className="status-copy">No leagues found for this account.</p>;
  if (board.hasError) {
    return (
      <p className="status-copy" role="alert">
        The player catalog could not be loaded.
      </p>
    );
  }

  return (
    <>
      <div className="market-toolbar">
        <h1>Players</h1>
      </div>
      <MarketOffers showTrigger={false} cards={marketBoard.ownSquadCards}
        squadAvailable={marketBoard.ownSquadAvailable} />
      <div className="market-filter-row">
        <MarketPlayerSearch
          value={urlState.filters.query}
          onChange={(query) => setFilters({ query })}
          activeFilterCount={filterCount}
          onClearFilters={clearFilters}
          label="Search players"
          placeholder="Name, team or owner"
          inputId="players-search"
          suggestions={board.rows.map((row) => row.name)}
        />
      </div>
      <div className="market-results-summary">
        <p role="status">{visibleRows.length} of {filtered.length} players{leaderboard ? " · Top by points" : ""}{filterCount > 0 ? " · Filters active" : ""}</p>
        <span>Form: oldest → latest</span>
      </div>
      {board.isDegraded ? (
        <p className="market-notice status-copy" role="status">
          Some league data could not be loaded. Ownership and form may be incomplete.
        </p>
      ) : null}
      {actions.message && !dialogOpen ? (
        <p className="status-copy" role="alert">
          {actions.message}
        </p>
      ) : null}
      {visibleRows.length === 0 ? (
        <p className="status-copy">No players match your filters.</p>
      ) : (
        <>
          <ul className="market-list players-list">
            <PlayersListHead
              headings={columnHeadings}
              filters={urlState.filters}
              owners={owners}
              teams={teams}
              names={board.rows.map((row) => row.name)}
              onFiltersChange={(patch) => setFilters(patch)}
            />
            {visibleRows.map((row) => (
              <PlayersListRow
                key={row.playerId}
                row={row}
                favorite={favorites.has(row.playerId)}
                marketRow={matchingPlayerListing(row, marketRowsByPlayer.get(row.playerId) ?? null)}
                valueHistory={valueHistoryByPlayer.get(row.playerId) ?? []}
                ownSquadCard={ownSquadByPlayer.get(row.playerId) ?? null}
                actionContext={actionContext}
                actions={actions}
                sales={sales}
                onToggleFavorite={() => toggleFavorite(row.playerId)}
              />
            ))}
          </ul>
        </>
      )}
      {!leaderboard && filtered.length > PLAYERS_PAGE_SIZE ? (
        <NumberPagination page={currentPage} totalPages={totalPages}
          label="Players pages" onPageChange={(page) =>
            setSearchParams(withPlayersPage(searchParams, page), { replace: true })} />
      ) : null}
      <MarketActionDialogs
        actions={actions}
        money={marketBoard.money}
        squadMarketValue={marketBoard.squadMarketValue}
      />
    </>
  );
}

export function PlayersPage() {
  const { status } = useAuth();
  if (status !== "ready") return <GatePanel status={status} />;
  return (
    <section className="market-page players-page comparison-page">
      <PlayersList />
    </section>
  );
}
