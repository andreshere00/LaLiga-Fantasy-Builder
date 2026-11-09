/** Decorative proportion bar. The adjacent number carries the value for assistive technology. */
export function TeamMeter({ percent }: { percent: number | null | undefined }) {
  if (percent == null || !Number.isFinite(percent)) return null;
  const width = Math.min(100, Math.max(0, percent));
  return (
    <span className="team-meter" aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </span>
  );
}
