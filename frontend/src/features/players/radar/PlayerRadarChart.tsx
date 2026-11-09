import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { t } from "../../../i18n";
import type { PlayerRadarDto } from "../../../api/radar";
import { radarMetric } from "./radarLocalization";
import "./playerRadar.css";

function AxisTick({ x = 0, y = 0, payload, size = 12 }: { x?: number; y?: number; payload?: { value?: string }; size?: number }) {
  const words = (payload?.value ?? "").split(" ");
  const lines: string[] = [];
  for (const word of words) {
    if (!lines.length || `${lines.at(-1)} ${word}`.length > 10) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  const step = size + 2;
  return <text x={x} y={y - (lines.length - 1) * (step / 2 - 1)} textAnchor="middle" fill="var(--fb-secondary)" fontSize={size}>
    {lines.map((line, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : step}>{line}</tspan>)}
  </text>;
}

/**
 * The percentile radar plot shared by the player detail page and compact cards.
 * Sizing comes from the parent through CSS; `compact` only trims labels and ticks.
 */
export function PlayerRadarChart({ radar, comparison = null, compact = false }: {
  radar: PlayerRadarDto;
  comparison?: PlayerRadarDto | null;
  compact?: boolean;
}) {
  const complete = radar.axes.every((axis) => axis.percentile !== null);
  const points = radar.axes.map((axis, i) => ({ label: radarMetric(axis).label, player: axis.percentile,
    comparison: comparison?.axes[i].percentile ?? null }));
  return <div className={compact ? "player-radar-chart is-compact" : "player-radar-chart"} role="img"
    aria-label={t("Percentile radar for {{0}}{{1}}. Scale 0 to 100. Exact values in the metric table.", { 0: radar.player, 1: comparison ? t(" and {{0}}", { 0: comparison.player }) : "" })}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <RadarChart data={points} outerRadius={compact ? "56%" : "62%"} startAngle={90} endAngle={-270} accessibilityLayer={false}>
        <PolarGrid stroke="var(--fb-muted)" strokeOpacity={0.3} />
        <PolarAngleAxis dataKey="label" tickSize={compact ? 8 : 20} tick={<AxisTick size={compact ? 10 : 12} />} />
        {compact ? null : <PolarRadiusAxis domain={[0, 100]} ticks={[25, 50, 75, 100]} tick={{ fontSize: 10, fill: "var(--fb-muted)" }} axisLine={false} />}
        {compact ? <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} /> : null}
        {complete ? <Radar name={radar.player} dataKey="player" stroke="var(--fb-primary)" strokeWidth={2.5} fill="var(--fb-primary)" fillOpacity={0.13} isAnimationActive={false} /> : null}
        {comparison ? <Radar name={comparison.player} dataKey="comparison" stroke="var(--fb-secondary)" strokeWidth={2} strokeDasharray="6 4" fill="none" isAnimationActive={false} /> : null}
      </RadarChart>
    </ResponsiveContainer>
  </div>;
}
