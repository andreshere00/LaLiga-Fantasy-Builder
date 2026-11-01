import { useId } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type { PlayerRadarDto } from "../../../api/radar";
import "./playerRadar.css";

const number = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
    if (!lines.length || `${lines.at(-1)} ${word}`.length > 12) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return <text x={x} y={y - (lines.length - 1) * 6} textAnchor="middle" fill="var(--fb-secondary)" fontSize={12}>
    {lines.map((line, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>{line}</tspan>)}
  </text>;
}

/** A source-independent plot. Minutes and identity never become spokes. */
export function PlayerRadarPlot({ radar, comparison }: { radar: PlayerRadarDto; comparison?: PlayerRadarDto | null }) {
  const titleId = useId();
  const complete = radar.axes.every((axis) => axis.percentile !== null);
  const other = comparison && canCompareRadars(radar, comparison) ? comparison : null;
  const points = radar.axes.map((axis, i) => ({ label: axis.label, player: axis.percentile,
    comparison: other?.axes[i].percentile ?? null }));
  return <article className="player-radar" aria-labelledby={titleId}>
    <header className="player-radar-identity">
      <div><p className="player-radar-eyebrow">{radar.position} · {radar.profileLabel}</p>
        <h3 id={titleId}>{radar.player}</h3>
        <p>{radar.club}{radar.age === null ? "" : ` · ${radar.age} years`} · {radar.season.replace("-", "/")}</p>
      </div>
      <p className="player-radar-minutes"><strong>{radar.minutes.toLocaleString("en")}</strong><span>minutes in sample</span></p>
    </header>
    <p className="player-radar-population">{radar.cohort ? `Percentiles against ${radar.cohort.label}` : "Reference population unverified"}</p>
    <p className="player-radar-context">{radar.competition} · {radar.period}</p>
    {radar.stale ? <p className="player-radar-notice">Saved snapshot may be out of date. See its retrieval date below.</p> : null}
    {radar.warnings.length ? <ul className="player-radar-warnings">{radar.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
    {!complete ? <p className="player-radar-notice">Some metrics are not published. The polygon is hidden; all seven axes remain in the table.</p> : null}
    {comparison && !other ? <p className="player-radar-notice">These players cannot be overlaid: their comparison contexts differ.</p> : null}
    <div className="player-radar-content">
      <figure className="player-radar-figure">
        <div className="player-radar-chart" role="img" aria-label={`Percentile radar for ${radar.player}${other ? ` and ${other.player}` : ""}. Scale 0 to 100. Exact values in the metric table.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <RadarChart data={points} outerRadius="70%" startAngle={90} endAngle={-270} accessibilityLayer={false}>
              <PolarGrid stroke="var(--fb-muted)" strokeOpacity={0.3} />
              <PolarAngleAxis dataKey="label" tick={<AxisTick />} />
              <PolarRadiusAxis domain={[0, 100]} ticks={[25, 50, 75, 100]} tick={{ fontSize: 10, fill: "var(--fb-muted)" }} axisLine={false} />
              {complete ? <Radar name={radar.player} dataKey="player" stroke="var(--fb-primary)" strokeWidth={2.5} fill="var(--fb-primary)" fillOpacity={0.13} isAnimationActive={false} /> : null}
              {other ? <Radar name={other.player} dataKey="comparison" stroke="var(--fb-secondary)" strokeWidth={2} strokeDasharray="6 4" fill="none" isAnimationActive={false} /> : null}
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="player-radar-legend"><span><i aria-hidden="true" />{radar.player}</span>
          {other ? <span><i className="player-radar-comparison-line" aria-hidden="true" />{other.player}</span> : null}
        </figcaption>
      </figure>
      <div className="player-radar-table-wrap">
        <table className="player-radar-table">
          <caption>Percentiles for {radar.player}{other ? ` and ${other.player}` : ""}</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">{other ? radar.player : "Percentile"}</th>{other ? <th scope="col">{other.player}</th> : null}</tr></thead>
          <tbody>{radar.axes.map((axis, i) => <tr key={axis.key}>
            <th scope="row">{axis.label}<small>{axis.definition}</small></th>
            <td>{percentile(axis.percentile)}</td>{other ? <td>{percentile(other.axes[i].percentile)}</td> : null}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <p className="player-radar-explanation">P80 means the published 80th percentile, not an 80% success rate. Minutes are sample context, not a radar metric.</p>
    <details className="player-radar-methodology">
      <summary>Source and methodology</summary>
      <dl><div><dt>Source</dt><dd>{radar.source === "imported" ? "User-supplied import" : radar.source}</dd></div>
        <div><dt>Method</dt><dd>{radar.method} · {radar.recipeVersion}</dd></div>
        <div><dt>Retrieved / imported</dt><dd><time dateTime={radar.fetchedAt}>{radar.fetchedAt.slice(0, 10)}</time></dd></div>
        <div><dt>Data updated</dt><dd>{radar.dataAsOf?.slice(0, 10) ?? "Not published"}</dd></div>
        <div><dt>Reference sample</dt><dd>{radar.cohort ? `${radar.cohort.label}. ${radar.cohort.eligibility}` : "Unknown; no validated comparison available"}</dd></div>
        {radar.cohort?.size ? <div><dt>Players in population</dt><dd>{radar.cohort.size}</dd></div> : null}
      </dl>
      <p>Raw metric values are not supplied in this dataset. Percentiles cannot recover those values.</p>
    </details>
  </article>;
}
