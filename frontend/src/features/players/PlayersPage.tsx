import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { GatePanel } from "../gates/GatePanel";
import { AvailabilityCell } from "../market/cells/AvailabilityCell";
import { FormCell } from "../market/cells/FormCell";
import { FsypCell } from "../market/cells/FsypCell";
import { PositionCell } from "../market/cells/PositionCell";
import { PlayerTile } from "../lineup/PlayerTile";
import { MarketPlayerSearch } from "../market/MarketPlayerSearch";
import { formatEuro } from "../../api/format";
import { PlayerBookmarkButton } from "./PlayerBookmarkButton";
import { PlayerDetailsLink } from "./PlayerDetailsLink";
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
  favorite,
  onToggleFavorite,
}: {
  row: PlayerRow;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const formRow = {
    id: row.playerId,
    formRecent: row.formRecent,
    formRecentWeeks: row.formRecentWeeks,
  };
  const rowClass = favorite
    ? "market-row market-data-row players-row is-favorite"
    : "market-row market-data-row players-row";
  return (
    <li className={rowClass}>
      <div className="market-card">
        <PlayerDetailsLink
          playerId={row.playerId}
          playerName={row.name}
          className="market-player-details-link"
          card
        />
        <PlayerTile
          name={row.name}
          captain={false}
          variant="squad"
          showName={false}
          photoUrl={row.photoUrl}
          teamBadgeUrl={row.teamBadgeUrl}
        />
      </div>
      <span className="market-name-wrap" data-label="Player">
        <span className="market-name">{row.name}</span>
      </span>
      <span className="market-cell" data-label="Team">
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
      <span className="market-cell market-value" data-label="Market value">
        {formatEuro(row.marketValue)}
      </span>
      <span className="market-cell" data-label="Owned by">
        {row.ownedBy}
      </span>
      <span className="market-cell market-cell-availability" data-label="Availability">
        <AvailabilityCell availability={row.availability} />
      </span>
      <span className="market-cell" data-label="Position">
        <PositionCell positionId={row.positionId} />
      </span>
      <span className="market-cell players-actions-cell" data-label="Actions">
        <PlayerBookmarkButton
          pressed={favorite}
          playerName={row.name}
          onToggle={onToggleFavorite}
        />
      </span>
    </li>
  );
}

function PlayersList() {
  const board = usePlayersBoard();
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

  if (board.isLoading) return <p className="status-copy">Loading players…</p>;
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
      {leaderboard ? (
        <p className="players-leaderboard-hint status-copy" role="status">
          Top {PLAYERS_LEADERBOARD_SIZE} by FSYP. Use search or filters to browse the full catalog.
        </p>
      ) : null}
      {visibleRows.length === 0 ? (
        <p className="status-copy">No players match your filters.</p>
      ) : (
        <ul className="market-list players-list">
          <PlayersListHead
            headings={columnHeadings}
            filters={urlState.filters}
            owners={owners}
            onFiltersChange={(patch) => setFilters(patch)}
          />
          {visibleRows.map((row) => (
            <PlayersListRow
              key={row.playerId}
              row={row}
              favorite={favorites.has(row.playerId)}
              onToggleFavorite={() => toggleFavorite(row.playerId)}
            />
          ))}
        </ul>
      )}
      {!leaderboard && filtered.length > PLAYERS_PAGE_SIZE ? (
        <nav className="players-pagination" aria-label="Players pages">
          <button
            type="button"
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
            disabled={currentPage >= totalPages}
            onClick={() =>
              setSearchParams(withPlayersPage(searchParams, currentPage + 1), { replace: true })
            }
          >
            Next
          </button>
        </nav>
      ) : null}
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
