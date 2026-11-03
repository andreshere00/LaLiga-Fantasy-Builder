import { useId } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type { PlayerRadarDto } from "../../../api/radar";
import "./playerRadar.css";

const number = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const readableDate = (value: string) => date.format(new Date(value));

const percentile = (value: number | null) => value === null ? "Not published" : `P${number.format(value)}`;

/** Unknown populations are never compatible, even when both keys are null. */
export function canCompareRadars(a: PlayerRadarDto, b: PlayerRadarDto): boolean {
  return a.playerId !== b.playerId && a.comparisonKey !== null && a.comparisonKey === b.comparisonKey &&
    a.cohort !== null && b.cohort !== null && a.profile === b.profile && a.season === b.season &&
    a.method === b.method && a.source === b.source && a.recipeVersion === b.recipeVersion &&
    a.axes.every((axis, i) => axis.key === b.axes[i]?.key && axis.percentile !== null && b.axes[i].percentile !== null);
}

function AxisTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const words = (payload?.value ?? "").split(" ");
  const lines: string[] = [];
  for (const word of words) {
    if (!lines.length || `${lines.at(-1)} ${word}`.length > 10) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return <text x={x} y={y - (lines.length - 1) * 6} textAnchor="middle" fill="var(--fb-secondary)" fontSize={12}>
    {lines.map((line, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>{line}</tspan>)}
  </text>;
}

/** A source-independent plot. Minutes and identity never become spokes. */
export function PlayerRadarPlot({ radar, comparison, embedded = false }: { radar: PlayerRadarDto; comparison?: PlayerRadarDto | null; embedded?: boolean }) {
  const titleId = useId();
  const complete = radar.axes.every((axis) => axis.percentile !== null);
  const other = comparison && canCompareRadars(radar, comparison) ? comparison : null;
  const points = radar.axes.map((axis, i) => ({ label: axis.label, player: axis.percentile,
    comparison: other?.axes[i].percentile ?? null }));
  return <article className="player-radar" aria-labelledby={titleId}>
    <header className="player-radar-identity">
      <div>{embedded ? <h3 id={titleId}>{radar.profileLabel}</h3> : <>
        <p className="player-radar-eyebrow">{radar.position} · {radar.profileLabel}</p>
        <h3 id={titleId}>{radar.player}</h3>
      </>}
        <p>{embedded ? radar.competition : radar.club}{radar.age === null ? "" : ` · ${radar.age} years`}{embedded ? "" : ` · ${radar.season.replace("-", "/")}`}</p>
      </div>
      <p className="player-radar-minutes"><strong>{radar.minutes.toLocaleString("en")}</strong><span>minutes in sample</span></p>
    </header>
    <div className="player-radar-sample">
      <p className="player-radar-population">{radar.cohort ? `Percentiles against ${radar.cohort.label}` : "Reference population unverified"}</p>
      {!embedded ? <p className="player-radar-context">{radar.competition} · {radar.period}</p> : null}
    </div>
    {radar.stale ? <p className="player-radar-notice">Saved snapshot may be out of date. Its original retrieval date is in Source and methodology.</p> : null}
    {radar.warnings.length ? <ul className="player-radar-warnings">{radar.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
    {!complete ? <p className="player-radar-notice">{radar.axes.filter((axis) => axis.percentile !== null).length} of 7 metrics available. The polygon is hidden; all seven axes remain in the table.</p> : null}
    {comparison && !other ? <p className="player-radar-notice">These players cannot be overlaid: their comparison contexts differ.</p> : null}
    <div className="player-radar-content">
      <figure className="player-radar-figure">
        <p className="player-radar-scale">Percentile scale · 0 at centre · 100 at edge</p>
        <div className="player-radar-chart" role="img" aria-label={`Percentile radar for ${radar.player}${other ? ` and ${other.player}` : ""}. Scale 0 to 100. Exact values in the metric table.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <RadarChart data={points} outerRadius="58%" startAngle={90} endAngle={-270} accessibilityLayer={false}>
              <PolarGrid stroke="var(--fb-muted)" strokeOpacity={0.3} />
              <PolarAngleAxis dataKey="label" tickSize={20} tick={<AxisTick />} />
              <PolarRadiusAxis domain={[0, 100]} ticks={[25, 50, 75, 100]} tick={{ fontSize: 10, fill: "var(--fb-muted)" }} axisLine={false} />
              {complete ? <Radar name={radar.player} dataKey="player" stroke="var(--fb-primary)" strokeWidth={2.5} fill="var(--fb-primary)" fillOpacity={0.13} isAnimationActive={false} /> : null}
              {other ? <Radar name={other.player} dataKey="comparison" stroke="var(--fb-secondary)" strokeWidth={2} strokeDasharray="6 4" fill="none" isAnimationActive={false} /> : null}
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {!embedded || other ? <figcaption className="player-radar-legend"><span><i aria-hidden="true" />{radar.player}</span>
          {other ? <span><i className="player-radar-comparison-line" aria-hidden="true" />{other.player}</span> : null}
        </figcaption> : null}
      </figure>
      <div className="player-radar-table-wrap">
        <table className="player-radar-table">
          <caption className={embedded ? "visually-hidden" : undefined}>Percentiles for {radar.player}{other ? ` and ${other.player}` : ""}</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">{other ? radar.player : "Percentile"}</th>{other ? <th scope="col">{other.player}</th> : null}</tr></thead>
          <tbody>{radar.axes.map((axis, i) => <tr key={axis.key}>
            <th scope="row">{axis.label}<small>{axis.definition}</small></th>
            <td><span className="player-radar-value">{percentile(axis.percentile)}</span>
              {axis.percentile !== null ? <span className="player-radar-meter" aria-hidden="true"><span style={{ width: `${axis.percentile}%` }} /></span> : null}
            </td>{other ? <td>{percentile(other.axes[i].percentile)}</td> : null}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <details className="player-radar-methodology">
      <summary>Source and methodology</summary>
      <div className="player-radar-methodology-content">
        <section aria-labelledby={`${titleId}-provenance`}>
          <h4 id={`${titleId}-provenance`}>Data provenance</h4>
          <dl>
            <div><dt>Source</dt><dd>{radar.source === "imported" ? "User-supplied import" : radar.source.toLowerCase() === "datamb" ? "DataMB" : radar.source}</dd></div>
            <div><dt>Measurement</dt><dd>{radar.method === "provider_native_percentile" ? "Percentiles published by the provider" : radar.method === "user_supplied_percentile" ? "Imported percentiles" : "Published percentile data"}</dd></div>
            <div><dt>Reference sample</dt><dd>{radar.cohort ? <>{radar.cohort.label}<small>{radar.cohort.eligibility}</small></> : <>Not verified<small>Player comparisons are unavailable until the reference population is verified.</small></>}</dd></div>
            {radar.cohort?.size ? <div><dt>Players in sample</dt><dd>{radar.cohort.size.toLocaleString("en")}</dd></div> : null}
          </dl>
        </section>
        <section aria-labelledby={`${titleId}-dates`}>
          <h4 id={`${titleId}-dates`}>Dates</h4>
          <dl>
            <div><dt>{radar.source === "imported" ? "Imported" : "Retrieved"}</dt><dd><time dateTime={radar.fetchedAt}>{readableDate(radar.fetchedAt)}</time></dd></div>
            <div><dt>Source updated</dt><dd>{radar.dataAsOf ? <time dateTime={radar.dataAsOf}>{readableDate(radar.dataAsOf)}</time> : "Not provided by the source"}</dd></div>
          </dl>
          <p className="player-radar-context">Retrieval records when we saved the data, not when the provider updated it.</p>
        </section>
        <section className="player-radar-reading-guide" aria-labelledby={`${titleId}-reading`}>
          <h4 id={`${titleId}-reading`}>Reading this radar</h4>
          <ul>
            <li><strong>P80</strong> means the published 80th percentile, not an 80% success rate.</li>
            <li><strong>Minutes</strong> describe the sample and are not a radar metric.</li>
            <li><strong>Raw statistics</strong> are not included and cannot be reconstructed from percentiles.</li>
          </ul>
        </section>
      </div>
    </details>
  </article>;
}
