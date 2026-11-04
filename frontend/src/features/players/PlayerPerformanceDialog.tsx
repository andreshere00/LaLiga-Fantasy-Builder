import { decimal } from "../../i18n/format";
import { copy as localizeCopy, useLanguage } from "../../i18n";
import { Dialog } from "../../components/ui/Dialog";
import type { PlayerAverage } from "./playerAverages";
import { METRIC_GROUPS, METRIC_GUIDE, metricSource, seasonMetricShare } from "./playerMetricGuide";
import "./PlayerPerformanceDialog.css";

function EventShare({ title, partLabel, remainderLabel, share }: {
  title: string;
  partLabel: string;
  remainderLabel: string;
  share: NonNullable<ReturnType<typeof seasonMetricShare>>;
}) {
  useLanguage();
  return (
    <figure className="player-event-share">
      <figcaption><span>{title}</span><strong>≈{share.percent}%</strong></figcaption>
      <svg className="player-event-share-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
        <rect width="100" height="8" className="player-event-share-remainder" />
        <rect width={share.percent} height="8" className="player-event-share-part" />
      </svg>
      <div className="player-event-share-legend">
        <span><i aria-hidden="true" />{localizeCopy(partLabel)} <b>{localizeCopy(decimal(share.part, 2))}</b></span>
        <span><i aria-hidden="true" />{localizeCopy(remainderLabel)} <b>{localizeCopy(decimal(share.total - share.part, 2))}</b></span>
      </div>
      <p>{localizeCopy(decimal(share.total, 2))} {localizeCopy(" total / match · FutbolFantasy season")}</p>
    </figure>
  );
}

/** Full-width reading space keeps the expanded statistics out of the identity header. */
export function PlayerPerformanceDialog({ rows, playerName, onClose }: {
  rows: readonly PlayerAverage[];
  playerName: string;
  onClose: () => void;
}) {
  useLanguage();
  const available = rows.filter((row) => row.value != null);
  const missing = rows.filter((row) => row.value == null);
  const shots = seasonMetricShare(rows, "TaP", "T");
  const crosses = seasonMetricShare(rows, "CP", "C");

  return (
    <Dialog open title={localizeCopy("Per-match performance")} className="player-performance-dialog"
      description={localizeCopy(`${playerName} · Event counts per appearance, not per 90 minutes or Fantasy points.`)}
      onClose={onClose}>
      <section className="player-mean-guide" aria-labelledby="player-mean-title">
        <div>
          <h3 id="player-mean-title">{localizeCopy("What the average means")}</h3>
          <p>{localizeCopy("Total recorded actions ÷ appearances counted = actions per match.")}</p>
        </div>
        <div className="player-mean-example">
          <span>{localizeCopy("Illustrative example")}</span>
          <strong>{localizeCopy("16 shots ÷ 3 matches ≈ 5.33")}</strong>
          <span>{localizeCopy("Frequency, not shooting accuracy.")}</span>
        </div>
      </section>

      {shots || crosses ? <section className="player-event-shares" aria-label={localizeCopy("Event breakdowns")}>
        {shots ? <EventShare title={localizeCopy("Shots on target / all shots")} partLabel="On target"
          remainderLabel="Other attempts" share={shots} /> : null}
        {crosses ? <EventShare title={localizeCopy("Accurate crosses / all crosses")} partLabel="Accurate"
          remainderLabel="Other crosses" share={crosses} /> : null}
        <p className="player-performance-note">{localizeCopy("Approximate shares from rounded season averages. These show this player’s event mix, not a league ranking.")}</p>
      </section> : null}

      <div className="player-metric-groups">
        {METRIC_GROUPS.map((group) => {
          const metrics = available.filter((row) => (METRIC_GUIDE[row.code]?.group ?? "Other statistics") === group.title);
          if (metrics.length === 0) return null;
          const sources = [...new Set(metrics.map(metricSource))];
          const commonSource = sources.length === 1 ? sources[0] : null;
          return <section className="player-metric-group" key={group.title} aria-label={localizeCopy(group.title)}>
            <header><h3>{localizeCopy(group.title)}</h3><p>{localizeCopy(group.description)}</p>
              {commonSource ? <span className="player-metric-source">{localizeCopy(commonSource)}</span> : null}
            </header>
            <dl>{metrics.map((row) => <div className="player-metric-reading" key={row.code}>
              <dt><span className="player-metric-label">{localizeCopy(row.label)}</span>
                <small>{localizeCopy(METRIC_GUIDE[row.code]?.meaning ?? "An event count supplied by this data source.")}</small>
                {!commonSource ? <span className="player-metric-source">{localizeCopy(metricSource(row))}</span> : null}
              </dt>
              <dd><strong>{localizeCopy(decimal(row.value!, 2))}</strong><span>{localizeCopy("/ match")}</span></dd>
            </div>)}</dl>
          </section>;
        })}
      </div>

      {missing.length > 0 ? <details className="player-missing-metrics">
        <summary>{localizeCopy("Unavailable metrics (")}{missing.length})</summary>
        <p>{localizeCopy("Not supplied for this sample. Missing data is different from a recorded zero.")}</p>
        <ul>{missing.map((row) => <li key={row.code}><strong>{localizeCopy(row.label)}</strong>
          <span>{localizeCopy(METRIC_GUIDE[row.code]?.meaning ?? "No value supplied.")}</span></li>)}</ul>
      </details> : null}

      <details className="player-metric-methodology">
        <summary>{localizeCopy("Calculation, samples & definitions")}</summary>
        <p>{localizeCopy("Season means use FutbolFantasy’s counted matches (or played appearances when that count is absent). Fantasy fallback means use played matchweeks where that metric is recorded; their sample size is shown per metric. Zero counts are included. Missing counts are excluded.")}</p>
        <p>{localizeCopy("The samples can differ. Shares are shown only for paired FutbolFantasy season metrics. No share is calculated with missing inputs, zero attempts, inconsistent counts, or mixed sources.")}</p>
        <p>{localizeCopy("Key passes and LaLiga Fantasy’s assists without a goal follow different definitions and remain separate. Recoveries and steals also depend on the source’s classification. More activity is not automatically better: role, minutes and match context matter. These means describe past activity, not the next match.")}</p>
        <p>{localizeCopy("Definition guides: ")}<a href="https://www.statsperform.com/opta-event-definitions/" target="_blank" rel="noreferrer">{localizeCopy("Opta")}</a>, {" "}
          <a href="https://laligafantasy.zendesk.com/hc/es/articles/115002390453--C%C3%B3mo-se-calculan-los-puntos-de-mi-equipo" target="_blank" rel="noreferrer">{localizeCopy("LaLiga Fantasy")}</a>, {" "}
          <a href="https://www.itl.nist.gov/div898/handbook/eda/section3/eda351.htm" target="_blank" rel="noreferrer">{localizeCopy("arithmetic mean (NIST)")}</a>{localizeCopy(". These guides explain the terms; they do not certify every provider’s event classification.")}</p>
      </details>
    </Dialog>
  );
}
