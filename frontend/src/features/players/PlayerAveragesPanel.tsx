import { Collapsible } from "@base-ui/react/collapsible";
import { Button } from "../../components/ui/Button";
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
          {remaining.length > 0 ? (
            <Collapsible.Root className="player-detail-averages-details">
              <Collapsible.Trigger render={<Button variant="outline" shape="square" />}>Details</Collapsible.Trigger>
              <Collapsible.Panel>
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
            </Collapsible.Panel>
            </Collapsible.Root>
          ) : null}
        </>
      )}
    </section>
  );
}
