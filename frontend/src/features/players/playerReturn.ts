/** Accepts only the screens that send someone to a player. */
export function detailReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/players";
  if (/^\/(market|players)(\?|$)/.test(value)) return value;
  if (/^\/teams\/\d+(\?|$)/.test(value)) return value;
  return "/players";
}

/** Breadcrumb name for a validated return path. */
export function returnPlace(returnTo: string): "Market" | "Teams" | "Players" {
  if (returnTo.startsWith("/market")) return "Market";
  if (returnTo.startsWith("/teams/")) return "Teams";
  return "Players";
}
