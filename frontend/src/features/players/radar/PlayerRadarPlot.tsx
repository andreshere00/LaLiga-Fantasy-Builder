import { numberFormatter, dateFormatter } from "../../../i18n/format";
import { t, useTranslation } from "../../../i18n";
import { useId } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type { PlayerRadarDto } from "../../../api/radar";
import { radarMetric, radarProfile, radarSourceText } from "./radarLocalization";
import "./playerRadar.css";

const number = numberFormatter({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const date = dateFormatter({ day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
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
  useTranslation();
  const titleId = useId();
  const complete = radar.axes.every((axis) => axis.percentile !== null);
  const other = comparison && canCompareRadars(radar, comparison) ? comparison : null;
  const points = radar.axes.map((axis, i) => ({ label: radarMetric(axis).label, player: axis.percentile,
    comparison: other?.axes[i].percentile ?? null }));
  return <article className="player-radar" aria-labelledby={titleId}>
    <header className="player-radar-identity">
      <div>{embedded ? <h3 id={titleId}>{radarProfile(radar)}</h3> : <>
        <p className="player-radar-eyebrow">{t(radar.position)} · {radarProfile(radar)}</p>
        <h3 id={titleId}>{radar.player}</h3>
      </>}
        <p>{embedded ? t(radar.competition) : radar.club}{embedded ? "" : ` · ${radar.season.replace("-", "/")}`}</p>
      </div>
      <p className="player-radar-minutes"><strong>{numberFormatter().format(radar.minutes)}</strong><span>{t("minutes in sample")}</span></p>
    </header>
    <div className="player-radar-sample">
      <p className="player-radar-population">{radar.cohort ? t("Percentiles against {{0}}", { 0: radarSourceText(radar.cohort.label) }) : t("Reference population unverified")}</p>
      {!embedded ? <p className="player-radar-context">{t(radar.competition)} · {t(radar.period)}</p> : null}
    </div>
    {radar.stale ? <p className="player-radar-notice">{t("Saved snapshot may be out of date. Its original retrieval date is in Source and methodology.")}</p> : null}
    {radar.warnings.length ? <ul className="player-radar-warnings">{radar.warnings.map((warning, i) => <li key={i}>{radarSourceText(warning)}</li>)}</ul> : null}
    {!complete ? <p className="player-radar-notice">{radar.axes.filter((axis) => axis.percentile !== null).length} {t(" of 7 metrics available. The polygon is hidden; all seven axes remain in the table.")}</p> : null}
    {comparison && !other ? <p className="player-radar-notice">{t("These players cannot be overlaid: their comparison contexts differ.")}</p> : null}
    <div className="player-radar-content">
      <figure className="player-radar-figure">
        <p className="player-radar-scale">{t("Percentile scale · 0 at centre · 100 at edge")}</p>
        <div className="player-radar-chart" role="img" aria-label={t("Percentile radar for {{0}}{{1}}. Scale 0 to 100. Exact values in the metric table.", { 0: radar.player, 1: other ? t(" and {{0}}", { 0: other.player }) : "" })}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <RadarChart data={points} outerRadius="62%" startAngle={90} endAngle={-270} accessibilityLayer={false}>
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
          <caption className={embedded ? "visually-hidden" : undefined}>{t("Percentiles for ")}{radar.player}{other ? t(" and {{0}}", { 0: other.player }) : ""}</caption>
          <thead><tr><th scope="col">{t("Metric")}</th><th scope="col">{other ? radar.player : t("Percentile")}</th>{other ? <th scope="col">{other.player}</th> : null}</tr></thead>
          <tbody>{radar.axes.map((axis, i) => <tr key={axis.key}>
            <th scope="row">{radarMetric(axis).label}<small>{radarMetric(axis).definition}</small></th>
            <td><span className="player-radar-value">{percentile(axis.percentile)}</span>
              {axis.percentile !== null ? <span className="player-radar-meter" aria-hidden="true"><span style={{ width: `${axis.percentile}%` }} /></span> : null}
            </td>{other ? <td>{percentile(other.axes[i].percentile)}</td> : null}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <RadarMethodology radar={radar} titleId={titleId} />
  </article>;
}

function RadarMethodology({ radar, titleId }: { radar: PlayerRadarDto; titleId: string }) {
  useTranslation();
  return (
    <details className="player-radar-methodology">
      <summary>{t("Source and methodology")}</summary>
      <div className="player-radar-methodology-content">
        <section aria-labelledby={`${titleId}-provenance`}>
          <h4 id={`${titleId}-provenance`}>{t("Data provenance")}</h4>
          <dl>
            <div><dt>{t("Source")}</dt><dd>{radar.source === "imported" ? t("User-supplied import") : radar.source.toLowerCase() === "datamb" ? "DataMB" : radar.source}</dd></div>
            <div><dt>{t("Measurement")}</dt><dd>{radar.method === "provider_native_percentile" ? t("Percentiles published by the provider") : radar.method === "user_supplied_percentile" ? t("Imported percentiles") : t("Published percentile data")}</dd></div>
            <div><dt>{t("Reference sample")}</dt><dd>{radar.cohort ? <>{radarSourceText(radar.cohort.label)}<small>{radarSourceText(radar.cohort.eligibility)}</small></> : <>{t("Not verified")}<small>{t("Player comparisons are unavailable until the reference population is verified.")}</small></>}</dd></div>
            {radar.cohort?.size ? <div><dt>{t("Players in sample")}</dt><dd>{numberFormatter().format(radar.cohort.size)}</dd></div> : null}
          </dl>
        </section>
        <section aria-labelledby={`${titleId}-dates`}>
          <h4 id={`${titleId}-dates`}>{t("Dates")}</h4>
          <dl>
            <div><dt>{radar.source === "imported" ? t("Imported") : t("Retrieved")}</dt><dd><time dateTime={radar.fetchedAt}>{readableDate(radar.fetchedAt)}</time></dd></div>
            <div><dt>{t("Source updated")}</dt><dd>{radar.dataAsOf ? <time dateTime={radar.dataAsOf}>{readableDate(radar.dataAsOf)}</time> : t("Not provided by the source")}</dd></div>
          </dl>
          <p className="player-radar-context">{t("Retrieval records when we saved the data, not when the provider updated it.")}</p>
        </section>
        <section className="player-radar-reading-guide" aria-labelledby={`${titleId}-reading`}>
          <h4 id={`${titleId}-reading`}>{t("Reading this radar")}</h4>
          <ul>
            <li><strong>{t("P80")}</strong><span>{t("The published 80th percentile, not an 80% success rate.")}</span></li>
            <li><strong>{t("Minutes")}</strong><span>{t("Describe the sample; they are not a radar metric.")}</span></li>
            <li><strong>{t("Raw statistics")}</strong><span>{t("Not included and cannot be reconstructed from percentiles.")}</span></li>
          </ul>
        </section>
      </div>
    </details>
  );
}
