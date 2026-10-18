export type BuilderScoreAxis = "lineup" | "trading" | "combined";
export type BuilderScoreTone = "purple" | "green" | "yellow" | "red";

/** Color the unrounded score; yellow covers the gap below the lineup green threshold. */
export function builderScoreTone(score: number, axis: BuilderScoreAxis): BuilderScoreTone {
  if (axis === "combined") {
    if (score >= 1.2) return "purple";
    if (score >= 0.6) return "green";
    return score >= 0 ? "yellow" : "red";
  }
  if (score > 0.5) return "purple";
  if (axis === "lineup") {
    if (score >= 0.3) return "green";
    return score >= 0 ? "yellow" : "red";
  }
  if (score >= 0) return "green";
  return score >= -0.25 ? "yellow" : "red";
}
