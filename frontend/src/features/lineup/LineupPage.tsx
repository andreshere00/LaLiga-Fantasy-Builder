import { pointsLabel, possessiveName, scoreWeekLabel } from "../../api/mappers";
import { PersonIcon } from "../shell/icons";
import footballIconUrl from "../../assets/boxicons_football-filled.svg";
import fieldUrl from "../../assets/football_field.svg";
import { PlayerTile } from "./PlayerTile";
import { useLineupBoard } from "./useLineupBoard";
import "./LineupPage.css";

const RECOMMEND_COPY =
  "Write your lineup preferences (e.g., give the captaincy to Raphinha)";

function scorePointsLabel(weekLoading: boolean, points: number | null): string {
  if (weekLoading) return "…";
  if (points == null) return "—";
  return String(points);
}

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
        <div className="board-controls">
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
          <div className="control-block">
            <span className="field-label">Score</span>
            <div className="score-pill" aria-live="polite">
              <span className="score-week">{scoreWeekLabel(board.week)}</span>
              <span className="score-points">
                {scorePointsLabel(board.weekLoading, board.scorePoints)}
              </span>
            </div>
          </div>
          <div className="control-block formation-field">
            <span className="field-label">Formation</span>
            <p className="formation-value">{board.formation}</p>
          </div>
          <div className="control-block recommend">
            <span className="field-label">Recommend lineup</span>
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
          <div className="control-block team-value">
            <span className="field-label">Team value</span>
            <div className="value-box">{board.teamValueLabel}</div>
          </div>
        </div>

        <div className="column">
          <h2 className="column-title">Players</h2>
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

        <div className="column">
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
