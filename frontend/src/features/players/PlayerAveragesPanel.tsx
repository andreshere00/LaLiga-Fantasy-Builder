import { numberFormatter } from "../../i18n/format";
import { t, useTranslation } from "../../i18n";
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
    return (row.sampleSize ?? 0) === 1 ? t("LaLiga Fantasy API · {{0}} played matchweek", { 0: 1 }) : t("LaLiga Fantasy API · {{0}} played matchweeks", { 0: row.sampleSize ?? 0 });
  }
  if (row.source === "futbolfantasy") return t("FutbolFantasy season");
  return t("Unavailable");
}

function averageValue(row: PlayerAverage): string {
  return row.value == null ? "—" : numberFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(row.value);
}

/** Compact position highlights with the other averages behind Details. */
export function PlayerAveragesPanel({ rows, positionId, playerName = t("Player") }: PlayerAveragesPanelProps) {
  useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const highlighted = highlightedAverages(rows, positionId);
  const hasValues = rows.some((row) => row.value != null);
  const fantasySampleSize = highlighted.find((row) => row.source === "fantasy")?.sampleSize;

  return (
    <section className="player-detail-header-averages" aria-labelledby="player-averages-title">
      <div className="player-averages-heading">
        <div>
          <h2 className="player-section-title" id="player-averages-title">{t("Averages per match")}</h2>
          {hasValues && highlighted.some((row) => row.source === "futbolfantasy") ? (
            <p className="player-detail-averages-source-note">{t("Season averages from FutbolFantasy.")}</p>
          ) : null}
        </div>
        {hasValues ? <Button variant="outline" shape="square" aria-haspopup="dialog"
          className="player-averages-more"
          onClick={() => setDetailsOpen(true)}>
          <span>{t("More averages")}</span><span className="player-averages-more-arrow" aria-hidden="true">↗</span>
        </Button> : null}
      </div>
      {!hasValues ? (
        <p className="status-copy">{t("Per-match averages are unavailable.")}</p>
      ) : (
        <>
          <dl className="fb-metric-grid">
            {highlighted.map((row) => (
              <div key={row.code} title={averageSource(row)}>
                <dt>{t(row.label)}</dt><dd>{averageValue(row)}</dd>
              </div>
            ))}
          </dl>
          {fantasySampleSize != null ? (
            <p className="player-detail-averages-source-note">
              {fantasySampleSize === 1 ? t("LaLiga Fantasy API fallback averages use {{0}} played matchweek.", { 0: fantasySampleSize }) : t("LaLiga Fantasy API fallback averages use {{0}} played matchweeks.", { 0: fantasySampleSize })}
            </p>
          ) : null}
          {detailsOpen ? <PlayerPerformanceDialog rows={rows} playerName={playerName}
            onClose={() => setDetailsOpen(false)} /> : null}
        </>
      )}
    </section>
  );
}
