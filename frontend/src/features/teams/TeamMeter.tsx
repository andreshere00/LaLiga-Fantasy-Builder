import type { StarterProbabilityTone } from "../players/starterProbability";

/** Decorative proportion bar. The adjacent number carries the value for assistive technology. */
export function TeamMeter({ percent, tone }: { percent: number | null | undefined; tone?: StarterProbabilityTone | null }) {
  if (percent == null || !Number.isFinite(percent)) return null;
  const width = Math.min(100, Math.max(0, percent));
  return (
    <span className="team-meter" data-tone={tone ?? undefined} aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </span>
  );
}
