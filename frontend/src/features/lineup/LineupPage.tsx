import { useEffect, type CSSProperties } from "react";

import { pointsLabel, possessiveName, scoreWeekLabel } from "../../api/mappers";
import { PersonIcon, SearchIcon, WarningIcon } from "../shell/icons";
import footballIconUrl from "../../assets/boxicons_football-filled.svg";
import saveCartridgeIconUrl from "../../assets/save_cartridge.svg";
import fieldUrl from "../../assets/football_field.svg";
import { pitchRowGapFraction, pitchRows } from "./pitchLayout";
import { SQUAD_PICKER_EMPTY_MESSAGE } from "./playerTileCopy";
import { PlayerTile } from "./PlayerTile";
import { useLineupBoard } from "./useLineupBoard";
import "./LineupPage.css";

const RECOMMEND_COPY = "Write your lineup preferences";

/** Swap layout tokens via data-layout-profile; see lineup-layout.css. */
const LINEUP_LAYOUT_PROFILE = "desktop-16-9";

function scorePointsLabel(weekLoading: boolean, points: number | null): string {
  if (weekLoading) return "…";
  if (points == null) return "—";
  return String(points);
}

export function LineupPage() {
  const board = useLineupBoard();
  const owner = possessiveName(board.titleName);
  useEffect(() => {
    if (!board.pitchSelection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        board.selectPitchPlayer(
          board.pitchSelection!.role,
          board.pitchSelection!.playerId,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [board.pitchSelection, board.selectPitchPlayer]);

  if (board.isLoading) {
    return (
      <section className="lineup-page" data-layout-profile={LINEUP_LAYOUT_PROFILE}>
        <p className="status-copy">Loading lineup…</p>
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
              <div className="pager">
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
            </div>
            <div className="control-block" aria-live="polite">
              <span className="field-label">Score</span>
              <div className="score-pill">
                <span className="score-week">{scoreWeekLabel(board.week)}</span>
                <span className="score-points">
                  {scorePointsLabel(board.weekLoading, board.scorePoints)}
                </span>
              </div>
            </div>
            </div>
            <div className="controls-zone controls-zone-center">
            <div className="control-block formation-field">
              <span className="field-label">Formation</span>
              {board.editable ? (
                <div className="select-wrap formation-select">
                  <select
                    aria-label="Formation"
                    value={board.formationCode ?? ""}
                    onChange={(event) => board.setFormationCode(event.target.value)}
                  >
                    {board.formationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="formation-value">{board.formation}</p>
              )}
            </div>
            <div className="control-block recommend">
              <span className="field-label">Build lineup</span>
              <div className="accent-control-shell">
                <button type="button" className="recommend-button">
                  <span className="recommend-button-text">{RECOMMEND_COPY}</span>
                  <img
                    className="recommend-button-icon"
                    src={footballIconUrl}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
            <div className="control-block save-lineup">
              <span className="field-label">Save lineup</span>
              <div className="accent-control-shell save-lineup-shell">
                <button
                  type="button"
                  className="save-lineup-button"
                  disabled={board.saveDisabled}
                  onClick={() => board.saveLineup()}
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
              </div>
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
              <div className="value-box">{board.teamValueLabel}</div>
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
                          <PersonIcon />
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
            <img src={fieldUrl} alt="" />
            {board.lineupLoading ? <p className="pitch-note">Loading lineup…</p> : null}
            {board.lineupMessage ? (
              <p className="pitch-note" role="alert">
                {board.lineupMessage}
              </p>
            ) : null}
            {board.pitchEmpty ? <p className="pitch-note">Lineup unavailable</p> : null}
            <div className="pitch-rows">
              {board.groups.map((group) => {
                const rows = pitchRows(group.players, group.role);
                if (rows.length === 0) return null;
                return (
                  <div key={group.role} className={`pitch-line pitch-line-${group.role}`}>
                    {rows.map((row) => {
                      const gapFraction = pitchRowGapFraction(row.length);
                      return (
                        <div
                          key={row.map((player) => player.id).join("-")}
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
                            return (
                              <PlayerTile
                                key={player.id}
                                name={player.name}
                                captain={!empty && player.id === board.captainId}
                                variant="pitch"
                                empty={empty}
                                photoUrl={player.photoUrl}
                                teamBadgeUrl={player.teamBadgeUrl}
                                interactive={board.editable}
                                selected={selected}
                                onSelect={() =>
                                  board.selectPitchPlayer(group.role, player.id)
                                }
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="column column-team">
          <div className="side-panel side-panel-modal squad-panel">
            <h2 className="column-title">{owner} squad</h2>
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
                  <div className="squad-grid">
                    {board.squadPanelPlayers.map((player) => (
                      <PlayerTile
                        key={player.id}
                        name={player.name}
                        captain={player.captain}
                        variant="squad"
                        photoUrl={player.photoUrl}
                        teamBadgeUrl={player.teamBadgeUrl}
                        interactive={picking}
                        onSelect={
                          picking ? () => board.pickSquadPlayer(player.id) : undefined
                        }
                      />
                    ))}
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
    </section>
  );
}
