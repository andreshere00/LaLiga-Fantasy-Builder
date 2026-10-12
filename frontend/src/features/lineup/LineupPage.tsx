import { Help } from "../../components/ui/Help";
import { Select } from "@base-ui/react/select";
import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";

import { pointsLabel, possessiveName, scoreWeekLabel } from "../../api/mappers";
import { PersonIcon, SearchIcon, WarningIcon } from "../shell/icons";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import builderIconUrl from "../../assets/icon_builder_white.svg";
import saveCartridgeIconUrl from "../../assets/save_cartridge.svg";
import { PitchMarkings } from "./PitchMarkings";
import { PulseRing } from "../../components/ui/PulseRing";
import originalFixtureBlackUrl from "../../assets/button_original_fixture_black.svg";
import originalFixtureWhiteUrl from "../../assets/button_original_fixture_white.svg";
import originalFixtureGrayUrl from "../../assets/button_original_fixture_gray.svg";
import { pitchRowGapFraction, pitchRows } from "./pitchLayout";
import { SQUAD_PICKER_EMPTY_MESSAGE } from "./playerTileCopy";
import { squadCountLabel } from "./squadPanel";
import { CurrentFixtureTooltip } from "./CurrentFixtureTooltip";
import { OpponentLineupNotice } from "./OpponentLineupNotice";
import { PlayedFixtureNotice } from "./PlayedFixtureNotice";
import { PlayerTile } from "./PlayerTile";
import { roleFromPositionId } from "./lineupDraft";
import { SquadPlayerActions } from "./SquadPlayerActions";
import { LineupMarketOptions } from "./LineupMarketOptions";
import { TeamValueBox } from "./TeamValueBox";
import { useLineupBoard } from "./useLineupBoard";
import { useSquadSales } from "./useSquadSales";
import { LineupBuilderDialog } from "./LineupBuilderDialog";
import "./LineupPage.css";

const RECOMMEND_COPY = "Write your lineup preferences...";

/** Swap layout tokens via data-layout-profile; see lineup-layout.css. */
const LINEUP_LAYOUT_PROFILE = "desktop-16-9";

function scorePointsLabel(weekLoading: boolean, points: number | null): string {
  if (weekLoading) return "…";
  if (points == null) return "—";
  return String(points);
}

export function LineupPage() {
  const [searchParams] = useSearchParams();
  const board = useLineupBoard({ initialTeamId: searchParams.get("team") });
  const squadSales = useSquadSales();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [swapCandidate, setSwapCandidate] = useState<{
    playerId: string;
    positionId: number | null;
    name: string;
    teamId: string | null;
    week: number;
  } | null>(null);
  const activeSwap = board.editable && swapCandidate?.teamId === board.selectedTeamId &&
    swapCandidate.week === board.week ? swapCandidate : null;

  const currentFixtureTooltip = board.unplayedFixtureScoreTooltip;
  const owner = possessiveName(board.titleName);
  const { pitchSelection, selectPitchPlayer } = board;
  useEffect(() => {
    if (!pitchSelection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        selectPitchPlayer(pitchSelection.role, pitchSelection.playerId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pitchSelection, selectPitchPlayer]);

  if (board.isLoading) {
    return (
      <section className="lineup-page" data-layout-profile={LINEUP_LAYOUT_PROFILE}>
        <PulseRing label="Loading lineup…" />
      </section>
    );
  }

  if (board.emptyLeague) {
    return (
      <section className="lineup-page" data-layout-profile={LINEUP_LAYOUT_PROFILE}>
        <p className="status-copy">No leagues found for this account.</p>
      </section>
    );
  }

  const picking = board.pitchSelection != null;
  const saveNoChangesOnly =
    board.saveNoChangesTooltip != null && board.saveDisabled && !board.savePending;

  return (
    <section className="lineup-page" data-layout-profile={LINEUP_LAYOUT_PROFILE}>
      {board.errorMessage ? (
        <p className="status-copy" role="alert">
          {board.errorMessage}
        </p>
      ) : null}
      <div className="board">
        <div className="board-controls-bar side-panel">
          <h1 className="board-controls-title">
            {owner} <span>lineup</span>
          </h1>
          <div className="board-controls">
            <div className="controls-zone controls-zone-start">
            <div className="control-block">
              <span className="field-label">Fixture</span>
              <CurrentFixtureTooltip message={currentFixtureTooltip}>
                <div className="pager current-fixture-pager">
                  <button
                    type="button"
                    aria-label="Previous fixture"
                    disabled={board.week <= 1}
                    onClick={() => board.goToWeek(board.week - 1)}
                  >
                    ‹
                  </button>
                  <span>{board.week}</span>
                  <button
                    type="button"
                    aria-label="Next fixture"
                    disabled={board.week >= board.maxWeek}
                    onClick={() => board.goToWeek(board.week + 1)}
                  >
                    ›
                  </button>
                </div>
              </CurrentFixtureTooltip>
            </div>
            <div className="control-block" aria-live="polite">
              <span className="field-label">Score</span>
              <CurrentFixtureTooltip message={currentFixtureTooltip}>
                <div className="score-pill">
                  <span className="score-week">{scoreWeekLabel(board.week)}</span>
                  <span className="score-points">
                    {scorePointsLabel(board.weekLoading, board.scorePoints)}
                  </span>
                </div>
              </CurrentFixtureTooltip>
            </div>
            </div>
            <div className="controls-zone controls-zone-center">
            <div className="control-block formation-field">
              <span className="field-label">Formation</span>
              {board.editable ? (
                <Select.Root items={board.formationOptions} value={board.formationCode}
                  onValueChange={(value) => { if (value) board.setFormationCode(value); }}>
                  <Select.Trigger className="fb-select-trigger lineup-formation-trigger" aria-label="Formation">
                    <Select.Value />
                    <Select.Icon className="lineup-formation-icon" aria-hidden="true">
                      <svg viewBox="0 0 18 18">
                        <path d="m4 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner sideOffset={4} className="fb-select-positioner">
                      <Select.Popup className="fb-selection-popup">
                        <Select.List>
                          {board.formationOptions.map((option) => (
                            <Select.Item key={option.value} value={option.value} className="fb-item">
                              <Select.ItemText>{option.label}</Select.ItemText>
                              <Select.ItemIndicator aria-hidden="true">✓</Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.List>
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              ) : (
                <p className="formation-value">{board.formation}</p>
              )}
            </div>
            <div className="control-block recommend">
              <span className="field-label">Build lineup</span>
              <div className="accent-control-shell">
                <button type="button" className="recommend-button" onClick={() => setBuilderOpen(true)}>
                  <span className="recommend-button-text">{RECOMMEND_COPY}</span>
                  <img
                    className="recommend-button-icon"
                    src={builderIconUrl}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
            <div className="control-block save-lineup">
              <span className="field-label">Save lineup</span>
              <Help content={board.saveNoChangesTooltip}
                trigger={<div className="accent-control-shell save-lineup-shell" />}>
                <button
                  type="button"
                  className="save-lineup-button"
                  disabled={board.saveDisabled && !saveNoChangesOnly}
                  aria-disabled={saveNoChangesOnly ? true : undefined}
                  onClick={() => {
                    if (saveNoChangesOnly) return;
                    board.saveLineup();
                  }}
                >
                  <span className="save-lineup-button-text">
                    {board.savePending ? "Saving…" : "Save"}
                  </span>
                  <img
                    className="save-lineup-button-icon"
                    src={saveCartridgeIconUrl}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
              </Help>
              {board.saveMessage ? (
                <p className="save-lineup-message" role="alert">
                  {board.saveMessage}
                </p>
              ) : null}
            </div>
            </div>
            <div className="controls-zone controls-zone-end">
            <div className="control-block team-value">
              <span className="field-label">Team value</span>
              <TeamValueBox
                evolution={board.teamValueEvolution}
                historyLoading={board.teamValueHistoryLoading}
                onRequestHistory={board.requestTeamValueHistory}
              />
            </div>
            </div>
          </div>
        </div>

        <div className="column column-players">
          <div className="side-panel side-panel-modal players-panel">
            <h2 className="column-title">Players</h2>
            <div className="side-panel-body">
              <div className="side-panel-scroll">
                <ul className="rank-list">
                {board.ranking.map((row) => {
                  const active = row.teamId === board.selectedTeamId;
                  return (
                    <li key={row.teamId}>
                      <button
                        type="button"
                        className={active ? "rank-row active" : "rank-row"}
                        aria-current={active ? "true" : undefined}
                        disabled={!row.selectable}
                        onClick={() => board.selectTeam(row.teamId)}
                      >
                        <span className="rank-position">{row.position ?? "—"}</span>
                        <span className="avatar" aria-hidden="true">
                          <ProfilePhoto url={row.avatarUrl} fallback={<PersonIcon />} />
                        </span>
                        <span className="rank-name">{row.name}</span>
                        <span className="rank-points">{pointsLabel(row.points)}</span>
                      </button>
                    </li>
                  );
                })}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="column column-pitch">
          <div className="pitch">
            <PitchMarkings />
            {board.ownSquad && !board.isPastFixture ? (
              <div className="pitch-lineup-load-controls">
                <details className="pitch-lineup-load-menu">
                  <summary
                    className="pitch-original-lineup-button pitch-lineup-load-trigger"
                    aria-label="Load previous lineups"
                  >
                    <span className="pitch-original-lineup-icons" aria-hidden="true">
                      <img className="pitch-original-lineup-icon is-default" src={originalFixtureBlackUrl} alt="" />
                      <img className="pitch-original-lineup-icon is-hover" src={originalFixtureWhiteUrl} alt="" />
                    </span>
                  </summary>
                  <div className="pitch-lineup-load-options">
                    <Help content={board.originalLineupMessage}
                      trigger={<span className="pitch-scoring-lineup-control" />}>
                      <button
                        type="button"
                        className="pitch-original-lineup-button is-primary"
                        disabled={!board.originalLineupAvailable || board.savePending}
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          setSwapCandidate(null);
                          board.restoreOriginalLineup();
                        }}
                      >
                        <span className="pitch-original-lineup-icons" aria-hidden="true">
                          <img className="pitch-original-lineup-icon is-default" src={originalFixtureBlackUrl} alt="" />
                          <img className="pitch-original-lineup-icon is-hover" src={originalFixtureWhiteUrl} alt="" />
                          <img className="pitch-original-lineup-icon is-disabled" src={originalFixtureGrayUrl} alt="" />
                        </span>
                        <span>Load original lineup for {scoreWeekLabel(board.week)}</span>
                      </button>
                    </Help>
                    <button
                      type="button"
                      className="pitch-original-lineup-button"
                      disabled={!board.lastSavedLineupAvailable || board.savePending}
                      onClick={(event) => {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        setSwapCandidate(null);
                        board.restoreLastSavedLineup();
                      }}
                    >
                      <span className="pitch-original-lineup-icons" aria-hidden="true">
                        <img className="pitch-original-lineup-icon is-default" src={originalFixtureBlackUrl} alt="" />
                        <img className="pitch-original-lineup-icon is-hover" src={originalFixtureWhiteUrl} alt="" />
                        <img className="pitch-original-lineup-icon is-disabled" src={originalFixtureGrayUrl} alt="" />
                      </span>
                      <span>Load last saved lineup</span>
                    </button>
                  </div>
                </details>
              </div>
            ) : null}
            {board.opponentLineupLocked ? (
              <button
                type="button"
                className="pitch-opponent-lock"
                aria-label={board.opponentLineupUnavailableMessage ?? "Lineup unavailable"}
                onClick={() => board.openOpponentLineupNotice()}
              >
                <span className="pitch-opponent-lock-label">Lineup unavailable</span>
              </button>
            ) : null}
            {board.lineupLoading ? <p className="pitch-note">Loading lineup…</p> : null}
            {board.lineupMessage ? (
              <p className="pitch-note" role="alert">
                {board.lineupMessage}
              </p>
            ) : null}
            {board.pitchEmpty ? <p className="pitch-note">Lineup unavailable</p> : null}
            {activeSwap ? (
              <div className="lineup-swap-notice" role="status">
                Select a player on the pitch in the same position to swap with {activeSwap.name}.
                <button type="button" className="squad-sale-secondary" onClick={() => setSwapCandidate(null)}>Cancel</button>
              </div>
            ) : null}
            <Fragment key={`${board.selectedTeamId}-${board.week}`}>
            <div className="pitch-rows">
              {board.groups.map((group) => {
                const rows = pitchRows(group.players, group.role);
                if (rows.length === 0) return null;
                return (
                  <div key={group.role} className={`pitch-line pitch-line-${group.role}`}>
                    {rows.map((row, rowIndex) => {
                      const gapFraction = pitchRowGapFraction(row.length);
                      return (
                        <div
                          key={`${group.role}-${rowIndex}`}
                          className="pitch-row"
                          style={
                            {
                              "--pitch-row-gap": `${gapFraction * 100}cqw`,
                            } as CSSProperties
                          }
                        >
                          {row.map((player) => {
                            const selected =
                              board.pitchSelection?.playerId === player.id &&
                              board.pitchSelection.role === group.role;
                            const empty = player.isEmpty === true;
                            const squadPlayer = board.squad.find((card) => card.id === player.id) ?? {
                              id: player.id,
                              masterPlayerId: player.masterPlayerId,
                              name: player.name,
                              captain: player.id === board.captainId,
                              positionId: { goalkeeper: 1, defender: 2, midfield: 3, striker: 4 }[group.role],
                              photoUrl: player.photoUrl ?? null,
                              teamBadgeUrl: player.teamBadgeUrl ?? null,
                              marketValue: null,
                              onMarket: false,
                              listingId: null,
                              salePrice: null,
                            };
                            const tile = (onSelect: () => void) => (
                              <PlayerTile
                                name={player.name}
                                captain={!empty && player.id === board.captainId}
                                variant="pitch"
                                empty={empty}
                                photoUrl={player.photoUrl}
                                teamBadgeUrl={player.teamBadgeUrl}
                                fixturePoints={board.fixtureScoresVisible && !empty ? player.fixturePoints : null}
                                unplayedFixture={board.week === board.maxWeek && player.fixturePoints === 0}
                                isMvp={board.fixtureScoresVisible && player.isMvp === true}
                                interactive={!empty || board.editable}
                                selected={selected}
                                onSelect={onSelect}
                              />
                            );
                            return (
                              <div className="pitch-tile-motion" key={player.id}>
                                {empty || picking || activeSwap ? tile(() => {
                                  if (activeSwap) {
                                    if (roleFromPositionId(activeSwap.positionId) !== group.role) return;
                                    board.swapSquadPlayer({ role: group.role, playerId: player.id }, activeSwap.playerId);
                                    setSwapCandidate(null);
                                  } else {
                                    board.selectPitchPlayer(group.role, player.id);
                                  }
                                }) : (
                                  <SquadPlayerActions
                                    key={`${board.selectedTeamId}-${board.week}-${player.id}`}
                                    player={squadPlayer}
                                    sales={squadSales}
                                    cardMenu
                                    ownPlayer={board.ownSquad}
                                    onSwap={board.editable ? () => board.selectPitchPlayer(group.role, player.id) : undefined}
                                    opponentMarketOptions={(open, onClose) => (
                                      <LineupMarketOptions player={squadPlayer} open={open} onClose={onClose} />
                                    )}
                                  >
                                    {tile}
                                  </SquadPlayerActions>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            </Fragment>
          </div>
        </div>

        <div className="column column-team">
          <div
            className={
              picking
                ? "side-panel side-panel-modal squad-panel is-picking"
                : "side-panel side-panel-modal squad-panel"
            }
          >
            <h2 className="column-title">
              {owner} squad
              <span className="squad-count">{squadCountLabel(board.squad.length)}</span>
            </h2>
            {board.squadLoading ? <p className="status-copy">Loading squad…</p> : null}
            {board.squadMessage ? (
              <p className="status-copy" role="alert">
                {board.squadMessage}
              </p>
            ) : null}
            {picking ? (
              <div className="squad-picker">
                <label className="squad-picker-label" htmlFor="squad-picker-search">
                  Replace player
                </label>
                <div className="squad-picker-search">
                  <span className="squad-picker-search-icon" aria-hidden="true">
                    <SearchIcon />
                  </span>
                  <input
                    id="squad-picker-search"
                    className="squad-picker-input"
                    type="search"
                    value={board.squadSearch}
                    onChange={(event) => board.setSquadSearch(event.target.value)}
                    placeholder="Search by name"
                  />
                </div>
              </div>
            ) : null}
            <div className="side-panel-body">
              <div className="side-panel-scroll squad-panel-scroll">
                {picking && board.squadPicker.length === 0 ? (
                  <div className="squad-picker-empty" role="status">
                    <span className="squad-picker-empty-icon" aria-hidden="true">
                      <WarningIcon />
                    </span>
                    <p className="squad-picker-empty-text">{SQUAD_PICKER_EMPTY_MESSAGE}</p>
                  </div>
                ) : (
                  <div
                    className="squad-grid"
                    key={`${board.selectedTeamId}-${board.squadPage}-${picking}`}
                  >
                    {board.squadPanelPlayers.map((player) => {
                      const tile = (onSelect: () => void) => (
                        <PlayerTile
                          name={player.name}
                          captain={player.captain}
                          variant="squad"
                          photoUrl={player.photoUrl}
                          teamBadgeUrl={player.teamBadgeUrl}
                          fixturePoints={board.fixtureScoresVisible ? player.fixturePoints : null}
                          unplayedFixture={board.week === board.maxWeek && player.fixturePoints === 0}
                          isMvp={board.fixtureScoresVisible && player.isMvp === true}
                          interactive
                          onSelect={onSelect}
                        />
                      );
                      if (picking) {
                        return <div className="squad-tile-slot" key={player.id}>{tile(() => board.pickSquadPlayer(player.id))}</div>;
                      }
                      const pitchSlot = board.groups.flatMap((group) =>
                        group.players.map((slot) => ({ slot, role: group.role })),
                      ).find(({ slot }) => slot.id === player.id);
                      return (
                        <SquadPlayerActions
                          key={`${board.selectedTeamId}-${board.week}-${player.id}`}
                          player={player}
                          sales={squadSales}
                          cardMenu
                          ownPlayer={board.ownSquad}
                          onSwap={board.editable && roleFromPositionId(player.positionId) != null ? () => {
                            setSwapCandidate(null);
                            if (pitchSlot) {
                              board.selectPitchPlayer(pitchSlot.role, player.id);
                            } else {
                              setSwapCandidate({ playerId: player.id, positionId: player.positionId,
                                name: player.name, teamId: board.selectedTeamId, week: board.week });
                            }
                          } : undefined}
                          opponentMarketOptions={(open, onClose) => (
                            <LineupMarketOptions player={player} open={open} onClose={onClose} />
                          )}
                        >
                          {tile}
                        </SquadPlayerActions>
                      );
                    })}
                  </div>
                )}
              </div>
              {board.squadPageCount > 1 &&
              !(picking && board.squadPicker.length === 0) ? (
              <div className="squad-pager">
                <div className="pager">
                  <button
                    type="button"
                    aria-label="Previous squad page"
                    disabled={board.squadPage <= 1}
                    onClick={() => board.squadPagePrev()}
                  >
                    ‹
                  </button>
                  <span>{board.squadPage}</span>
                  <button
                    type="button"
                    aria-label="Next squad page"
                    disabled={board.squadPage >= board.squadPageCount}
                    onClick={() => board.squadPageNext()}
                  >
                    ›
                  </button>
                </div>
              </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <PlayedFixtureNotice
        open={board.pastFixtureNoticeOpen}
        onClose={board.dismissPastFixtureNotice}
      />
      <OpponentLineupNotice
        open={board.opponentLineupNoticeOpen}
        message={
          board.opponentLineupUnavailableMessage ??
          "The lineup is not available because this match has not been played yet."
        }
        onClose={board.dismissOpponentLineupNotice}
      />
      <LineupBuilderDialog open={builderOpen} onClose={() => setBuilderOpen(false)}
        ranking={board.ranking} squad={board.squad} selectedTeamId={board.selectedTeamId}
        formations={board.formationOptions} />
    </section>
  );
}
