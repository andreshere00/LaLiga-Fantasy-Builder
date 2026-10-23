import { useState } from "react";
import { Button } from "../../components/ui/Button";
import {
  highlightedAverages,
  type PlayerAverage,
} from "./playerAverages";
import { PlayerPerformanceDialog } from "./PlayerPerformanceDialog";
import "./PlayerAveragesPanel.css";

type PlayerAveragesPanelProps = {
  rows: readonly PlayerAverage[];
  positionId: number | null;
  playerName?: string;
};

function averageSource(row: PlayerAverage): string {
  if (row.source === "fantasy") {
    return `LaLiga Fantasy API · ${row.sampleSize ?? 0} played matchweeks`;
  }
  if (row.source === "futbolfantasy") return "FutbolFantasy season";
  return "Unavailable";
}

function averageValue(row: PlayerAverage): string {
  return row.value == null ? "—" : row.value.toFixed(2);
}

/** Compact position highlights with the other averages behind Details. */
export function PlayerAveragesPanel({ rows, positionId, playerName = "Player" }: PlayerAveragesPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const highlighted = highlightedAverages(rows, positionId);
  const hasValues = rows.some((row) => row.value != null);
  const fantasySampleSize = highlighted.find((row) => row.source === "fantasy")?.sampleSize;

  return (
    <section className="player-detail-header-averages" aria-labelledby="player-averages-title">
      <div className="player-averages-heading">
        <div>
          <h2 id="player-averages-title">Averages per match</h2>
          {hasValues && highlighted.some((row) => row.source === "futbolfantasy") ? (
            <p className="player-detail-averages-source-note">Season averages from FutbolFantasy.</p>
          ) : null}
        </div>
        {hasValues ? <Button variant="outline" shape="square" aria-haspopup="dialog"
          className="player-averages-more"
          onClick={() => setDetailsOpen(true)}>
          <span>More averages</span><span className="player-averages-more-arrow" aria-hidden="true">↗</span>
        </Button> : null}
      </div>
      {!hasValues ? (
        <p className="status-copy">Per-match averages are unavailable.</p>
      ) : (
        <>
          <dl className="fb-metric-grid">
            {highlighted.map((row) => (
              <div key={row.code} title={averageSource(row)}>
                <dt>{row.label}</dt><dd>{averageValue(row)}</dd>
              </div>
            ))}
          </dl>
          {fantasySampleSize != null ? (
            <p className="player-detail-averages-source-note">
              {`LaLiga Fantasy API fallback averages use ${fantasySampleSize} played matchweek${fantasySampleSize === 1 ? "" : "s"}.`}
            </p>
          ) : null}
          {detailsOpen ? <PlayerPerformanceDialog rows={rows} playerName={playerName}
            onClose={() => setDetailsOpen(false)} /> : null}
        </>
      )}
    </section>
  );
}
