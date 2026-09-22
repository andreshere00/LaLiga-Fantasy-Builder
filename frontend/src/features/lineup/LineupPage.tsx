import { pointsLabel, possessiveName, scoreWeekLabel } from "../../api/mappers";
import { PersonIcon } from "../shell/icons";
import fieldUrl from "../../assets/football_field.svg";
import { PlayerTile } from "./PlayerTile";
import { useLineupBoard } from "./useLineupBoard";
import "./LineupPage.css";

const RECOMMEND_COPY =
  "Write your lineup preferences (e.g., give the captaincy to Raphinha)";

export function LineupPage() {
  const board = useLineupBoard();
  const owner = possessiveName(board.titleName);

  if (board.isLoading) {
    return (
      <section className="lineup-page">
        <p className="status-copy">Loading lineup…</p>
      </section>
    );
  }

  if (board.emptyLeague) {
    return (
      <section className="lineup-page">
        <p className="status-copy">No leagues found for this account.</p>
      </section>
    );
  }

  return (
    <section className="lineup-page">
      <h1 className="lineup-title">
        {owner} <span>lineup</span>
      </h1>
      {board.errorMessage ? (
        <p className="status-copy" role="alert">
          {board.errorMessage}
        </p>
      ) : null}
      <div className="board">
        <div className="column">
          <div className="column-head controls-row">
            <div>
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
            <div>
              <span className="field-label">Score</span>
              <div className="score-pill">
                <span className="score-week">{scoreWeekLabel(board.week)}</span>
                <span className="score-points">
                  {board.scorePoints == null ? "—" : board.scorePoints}
                </span>
              </div>
            </div>
          </div>
          <h2 className="column-title">Players</h2>
          <div className="rank-list" role="list">
            {board.ranking.map((row) => {
              const active = row.teamId === board.selectedTeamId;
              return (
                <button
                  key={row.teamId}
                  type="button"
                  role="listitem"
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
              );
            })}
          </div>
        </div>

        <div className="column">
          <div className="column-head controls-row center-controls">
            <label className="formation-field">
              <span className="field-label">Formation</span>
              <span className="select-wrap">
                <select
                  aria-label="Formation"
                  value={board.formation}
                  onChange={() => undefined}
                >
                  <option value={board.formation}>{board.formation}</option>
                </select>
              </span>
            </label>
            <div className="recommend">
              <span className="field-label">Recommend lineup</span>
              <textarea readOnly rows={2} aria-label="Recommend lineup" value={RECOMMEND_COPY} />
            </div>
          </div>
          <div className="pitch">
            <img src={fieldUrl} alt="" />
            {board.lineupLoading ? <p className="pitch-note">Loading lineup…</p> : null}
            {board.pitchEmpty ? <p className="pitch-note">Lineup unavailable</p> : null}
            <div className="pitch-rows">
              {board.groups.map((group) => (
                <div key={group.role} className={`pitch-row pitch-row-${group.role}`}>
                  {group.players.map((player) => (
                    <PlayerTile
                      key={`${group.role}-${player.id}`}
                      name={player.name}
                      captain={player.id === board.captainId}
                      variant="pitch"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="column">
          <div className="column-head team-value">
            <span className="field-label">Team value</span>
            <div className="value-box">{board.teamValueLabel}</div>
          </div>
          <div className="squad-panel">
            <h2 className="column-title">{owner} team</h2>
            {board.squadLoading ? <p className="status-copy">Loading squad…</p> : null}
            {board.squadMessage ? (
              <p className="status-copy" role="alert">
                {board.squadMessage}
              </p>
            ) : null}
            <div className="squad-grid">
              {board.squad.map((player) => (
                <PlayerTile
                  key={player.id}
                  name={player.name}
                  captain={player.captain}
                  variant="squad"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
