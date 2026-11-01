/** Shares the player-profile starter indicator thresholds with squad badges. */
export function starterProbabilityTone(percent: number | null | undefined): "low" | "mid" | "high" | null {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return percent < 50 ? "low" : percent < 75 ? "mid" : "high";
}
