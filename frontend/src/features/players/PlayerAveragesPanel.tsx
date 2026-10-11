import { Fragment } from "react";
import {
  highlightedAverages,
  remainingAverages,
  type PlayerAverage,
} from "./playerAverages";

type PlayerAveragesPanelProps = {
  rows: readonly PlayerAverage[];
  positionId: number | null;
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
export function PlayerAveragesPanel({ rows, positionId }: PlayerAveragesPanelProps) {
  const highlighted = highlightedAverages(rows, positionId);
  const remaining = remainingAverages(rows, highlighted);
  const hasValues = rows.some((row) => row.value != null);
  const fantasySampleSize = highlighted.find((row) => row.source === "fantasy")?.sampleSize;

  return (
    <section className="player-detail-header-averages" aria-labelledby="player-averages-title">
      <h2 id="player-averages-title">Averages per match</h2>
      {!hasValues ? (
        <p className="status-copy">Per-match averages are unavailable.</p>
      ) : (
        <>
          <div className="player-detail-averages-preview-wrap">
            <table className="player-detail-averages-preview" aria-label="Highlighted averages per match">
              <tbody>
                {Array.from({ length: Math.ceil(highlighted.length / 2) }, (_, index) => (
                  <tr key={index}>
                    {highlighted.slice(index * 2, index * 2 + 2).map((row) => (
                      <Fragment key={row.code}>
                        <th scope="row">{row.label}</th>
                        <td title={averageSource(row)}>{averageValue(row)}</td>
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fantasySampleSize != null ? (
            <p className="player-detail-averages-source-note">
              {`LaLiga Fantasy API fallback averages use ${fantasySampleSize} played matchweek${fantasySampleSize === 1 ? "" : "s"}.`}
            </p>
          ) : null}
          {remaining.length > 0 ? (
            <details className="player-detail-averages-details">
              <summary>Details</summary>
              <div className="player-detail-table-wrap">
                <table className="player-detail-table">
                  <thead>
                    <tr>
                      <th>Statistic</th>
                      <th>Average</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remaining.map((row) => (
                      <tr key={row.code}>
                        <th scope="row">{row.label}</th>
                        <td>{averageValue(row)}</td>
                        <td>{averageSource(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
