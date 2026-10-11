import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { useNow } from "../../hooks/useNow";
import { useRetained } from "../../hooks/useRetained";
import { GatePanel } from "../gates/GatePanel";
import { SquadPlayerActions } from "../lineup/SquadPlayerActions";
import { useSquadSales } from "../lineup/useSquadSales";
import { AvailabilityCell } from "../market/cells/AvailabilityCell";
import { FormCell } from "../market/cells/FormCell";
import { FsypCell } from "../market/cells/FsypCell";
import { PositionCell } from "../market/cells/PositionCell";
import { ValueCell } from "../market/cells/ValueCell";
import { PlayerTile } from "../lineup/PlayerTile";
import { BidDialog } from "../market/actions/BidDialog";
import { ClauseDialog } from "../market/actions/ClauseDialog";
import { MarketActionMenu } from "../market/actions/MarketActionMenu";
import { useMarketActions } from "../market/actions/useMarketActions";
import type { MarketActionContext } from "../market/actions/marketActions";
import type { MarketRow } from "../market/model/row";
import { MarketMotionProvider, MarketRowMotion } from "../market/MarketRowMotion";
import { WithdrawDialog } from "../market/actions/WithdrawDialog";
import { useMarketBoard } from "../market/useMarketBoard";
import type { SquadCard } from "../../api/mappers";
import { MarketPlayerSearch } from "../market/MarketPlayerSearch";
import { formatEuro } from "../../api/format";
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
import { readFavoritePlayerIds, toggleFavoritePlayerId } from "./favorites";
import type { PlayerRow } from "./model/playerRow";
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
import "../market/MarketPage.css";
import "./PlayersPage.css";

function PlayersListRow({
  row,
  order,
  favorite,
  marketRow,
  ownSquadCard,
  actionContext,
  actions,
  sales,
  onToggleFavorite,
}: {
  row: PlayerRow;
  order: number;
  favorite: boolean;
  marketRow: MarketRow | null;
  ownSquadCard: SquadCard | null;
  actionContext: MarketActionContext;
  actions: ReturnType<typeof useMarketActions>;
  sales: ReturnType<typeof useSquadSales>;
  onToggleFavorite: () => void;
}) {
  const formRow = {
    id: row.playerId,
    formRecent: row.formRecent,
    formRecentWeeks: row.formRecentWeeks,
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
      {row.ownedBy}
    </Link>
  ) : (
    row.ownedBy
  );
  const detailsOptions = (
    <details className="players-detail-options">
      <summary className="market-actions-trigger">Options</summary>
      <ul className="market-actions-menu">
        <li className="market-actions-menu-item">
          <Link
            className="market-actions-item players-action-link"
            to={`/players/${encodeURIComponent(row.playerId)}`}
          >
            Player details
          </Link>
        </li>
      </ul>
    </details>
  );
  return (
    <MarketRowMotion order={order} className={rowClass}>
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
        <span className="market-name">{row.name}</span>
      </span>
      <span className="market-cell players-team-cell" data-label="Team" title={row.teamName ?? undefined}>
        {row.teamName ?? "-"}
      </span>
      <span className="market-cell market-fsyp-cell" data-label="FSYP">
        <FsypCell
          points={row.points}
          averagePoints={row.averagePoints}
          formRecent={row.formRecent}
        />
      </span>
      <span className="market-cell market-form" data-label="Form">
        <FormCell row={formRow} />
      </span>
      <span className="market-cell market-value players-value-cell" data-label="Market value">
        {marketRow ? (
          <ValueCell
            marketValue={row.marketValue}
            variation={marketRow.variation}
            variationPercent={marketRow.variationPercent}
            valueHistory={marketRow.valueHistory}
          />
        ) : (
          <span className="market-value-primary" title={`Market value: ${formatEuro(row.marketValue)}`}>
            {formatEuro(row.marketValue)}
          </span>
        )}
      </span>
      <span className="market-cell players-owner-cell" data-label="Owned by" title={row.ownedBy}>
        {ownerCell}
      </span>
      <span className="market-cell market-cell-availability" data-label="Availability">
        <AvailabilityCell availability={row.availability} />
      </span>
      <span className="market-cell" data-label="Position">
        <PositionCell positionId={row.positionId} />
      </span>
      <span className="market-cell players-actions-cell" data-label="Actions">
        {ownSquadCard ? (
          <SquadPlayerActions player={ownSquadCard} sales={sales} triggerText="Options">
            <span className="players-squad-actions-target" aria-hidden="true" />
          </SquadPlayerActions>
        ) : marketRow ? (
          <MarketActionMenu
            row={marketRow}
            context={actionContext}
            actions={actions}
            detailsPlayer={{ id: row.playerId, name: row.name }}
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
    </MarketRowMotion>
  );
}

function PlayersList() {
  const board = usePlayersBoard();
  const marketBoard = useMarketBoard();
  const actions = useMarketActions();
  const sales = useSquadSales();
  const now = useNow();
  const { user } = useAuth();
  const userId = user?.user_id ?? null;
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
  const bid = useRetained(actions.pendingBid);
  const clause = useRetained(actions.pendingClause);
  const withdraw = useRetained(actions.pendingWithdraw);
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
      <div className="market-filter-row">
        <MarketPlayerSearch
          value={urlState.filters.query}
          onChange={(query) => setFilters({ query })}
          activeFilterCount={filterCount}
          onClearFilters={clearFilters}
          label="Search players"
          placeholder="Name, team or owner"
          inputId="players-search"
        />
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
        <MarketMotionProvider>
          <ul className="market-list players-list">
            <PlayersListHead
              headings={columnHeadings}
              filters={urlState.filters}
              owners={owners}
              teams={teams}
              onFiltersChange={(patch) => setFilters(patch)}
            />
            {visibleRows.map((row, order) => (
              <PlayersListRow
                key={row.playerId}
                row={row}
                order={order}
                favorite={favorites.has(row.playerId)}
                marketRow={marketRowsByPlayer.get(row.playerId) ?? null}
                ownSquadCard={ownSquadByPlayer.get(row.playerId) ?? null}
                actionContext={actionContext}
                actions={actions}
                sales={sales}
                onToggleFavorite={() => toggleFavorite(row.playerId)}
              />
            ))}
          </ul>
        </MarketMotionProvider>
      )}
      {!leaderboard && filtered.length > PLAYERS_PAGE_SIZE ? (
        <nav className="players-pagination" aria-label="Players pages">
          <button
            type="button"
            className="players-pagination-button"
            disabled={currentPage <= 1}
            onClick={() =>
              setSearchParams(withPlayersPage(searchParams, currentPage - 1), { replace: true })
            }
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="players-pagination-button"
            disabled={currentPage >= totalPages}
            onClick={() =>
              setSearchParams(withPlayersPage(searchParams, currentPage + 1), { replace: true })
            }
          >
            Next
          </button>
        </nav>
      ) : null}
      <BidDialog
        open={actions.pendingBid != null}
        row={bid?.row ?? null}
        kind={bid?.kind ?? null}
        money={marketBoard.money}
        squadMarketValue={marketBoard.squadMarketValue}
        initialAmount={bid?.initialAmount ?? null}
        pending={actions.actionPending}
        error={actions.message}
        onClose={actions.closeBid}
        onConfirm={actions.submitBid}
      />
      <WithdrawDialog
        open={actions.pendingWithdraw != null}
        row={withdraw}
        pending={actions.actionPending}
        error={actions.message}
        onClose={actions.closeWithdraw}
        onConfirm={actions.confirmWithdraw}
      />
      <ClauseDialog
        open={actions.pendingClause != null}
        row={clause?.row ?? null}
        amount={clause?.amount ?? 0}
        pending={actions.actionPending}
        error={actions.message}
        onClose={actions.closeClause}
        onConfirm={actions.confirmClause}
      />
    </>
  );
}

export function PlayersPage() {
  const { status } = useAuth();
  if (status !== "ready") return <GatePanel status={status} />;
  return (
    <section className="market-page players-page">
      <PlayersList />
    </section>
  );
}
