import { z } from "zod";

export const radarProfileSchema = z.enum([
  "defense_progression_v1", "defense_fullback_v1", "goalkeeper_v1",
  "attacker_finishing_v1", "attacker_winger_v1", "midfielder_v1",
]);
export type RadarProfileId = z.infer<typeof radarProfileSchema>;

export const RADAR_METRICS: Record<RadarProfileId, readonly string[]> = {
  defense_progression_v1: ["passes_completed_p90", "forward_pass_completion_pct", "progressive_passes_p90", "possessions_won_p90", "defensive_duel_win_pct", "aerial_duel_win_pct", "progressive_carries_p90"],
  defense_fullback_v1: ["crosses_completed_p90", "expected_assists_p90", "progressive_passes_p90", "possessions_won_p90", "defensive_duel_win_pct", "aerial_duel_win_pct", "progressive_carries_p90"],
  goalkeeper_v1: ["save_pct", "aerial_duels_won_p90", "interceptions_padj", "passes_completed_p90", "long_pass_completion_pct", "short_pass_completion_pct", "psxg_minus_ga_p90"],
  attacker_finishing_v1: ["non_penalty_goals_p90", "non_penalty_xg_p90", "goal_conversion_pct", "aerial_duel_win_pct", "touches_in_box_p90", "expected_assists_p90", "offensive_duels_won_p90"],
  attacker_winger_v1: ["progressive_carries_p90", "dribbles_completed_p90", "non_penalty_goals_p90", "npxg_plus_xa_p90", "assists_p90", "key_passes_p90", "crosses_completed_p90"],
  midfielder_v1: ["duel_win_pct", "possessions_won_p90", "progressive_carries_p90", "forward_passes_completed_p90", "forward_pass_completion_pct", "key_passes_p90", "progressive_passes_p90"],
};
const positions = {
  defense_progression_v1: "Defense", defense_fullback_v1: "Defense", goalkeeper_v1: "Goalkeeper",
  attacker_finishing_v1: "Attacker", attacker_winger_v1: "Attacker", midfielder_v1: "Midfielder",
};
const finitePercentile = z.number().finite().min(0).max(100);
const readObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();
export const radarQuerySchema = z.object({
  season: z.string().regex(/^20\d{2}-\d{2}$/).refine((s) => Number(s.slice(-2)) === (Number(s.slice(0, 4)) + 1) % 100),
  profile: radarProfileSchema.optional(),
  comparePlayerId: z.string().regex(/^[0-9]{1,10}$/).optional(),
}).strict();
const cohortShape = readObject({
  id: z.string().min(1), label: z.string().min(1), referenceSnapshot: z.string().min(1),
  eligibility: z.string().min(1), size: z.number().int().positive().nullable(),
  minimumMinutes: z.number().int().nonnegative().nullable(),
});
export const playerRadarShape = readObject({
  playerId: z.string().regex(/^[0-9]{1,10}$/), player: z.string().min(1), club: z.string().min(1),
  age: z.number().int().min(0).max(100).nullable(), season: radarQuerySchema.shape.season,
  competition: z.string().min(1), period: z.string().min(1), minutes: z.number().int().nonnegative(),
  profile: radarProfileSchema, profileLabel: z.string().min(1),
  position: z.enum(["Defense", "Goalkeeper", "Attacker", "Midfielder"]),
  source: z.string().min(1), method: z.string().min(1), recipeVersion: z.string().min(1),
  snapshotId: z.string().min(1), fetchedAt: z.iso.datetime({ offset: true }),
  dataAsOf: z.iso.datetime({ offset: true }).nullable(), cohort: cohortShape.nullable(),
  axes: z.array(readObject({
    key: z.string().min(1), label: z.string().min(1), definition: z.string().min(1),
    percentile: finitePercentile.nullable(), source: z.string().min(1), sourceMetric: z.string().min(1),
    status: z.enum(["available", "not_published"]),
  }).refine((a) => (a.percentile !== null) === (a.status === "available"))).length(7),
  comparisonKey: z.string().min(1).nullable(), comparisonReason: z.string().nullable(),
  stale: z.boolean(), warnings: z.array(z.string()),
}).superRefine((r, ctx) => {
  if (r.position !== positions[r.profile] || r.axes.some((a, i) => a.key !== RADAR_METRICS[r.profile][i])) {
    ctx.addIssue({ code: "custom", message: "Radar axes do not match the profile" });
  }
  if (r.comparisonKey && (!r.cohort || r.axes.some((a) => a.percentile === null))) {
    ctx.addIssue({ code: "custom", message: "Incomplete comparison context" });
  }
});
export type PlayerRadarDto = z.infer<typeof playerRadarShape>;
export const radarResponseShape = readObject({
  playerId: z.string().regex(/^[0-9]{1,10}$/), season: radarQuerySchema.shape.season,
  availableSeasons: z.array(radarQuerySchema.shape.season),
  status: z.enum(["available", "unavailable"]), reason: z.string().nullable(),
  compatiblePlayers: z.array(readObject({ playerId: z.string().regex(/^[0-9]{1,10}$/), player: z.string(), profile: radarProfileSchema })),
  radars: z.array(playerRadarShape), comparison: playerRadarShape.nullable(),
  comparisonReason: z.string().nullable(),
}).superRefine((r, ctx) => {
  if ((r.radars.length > 0) !== (r.status === "available") ||
      r.radars.some((v) => v.playerId !== r.playerId || v.season !== r.season) ||
      new Set(r.radars.map((v) => v.profile)).size !== r.radars.length) {
    ctx.addIssue({ code: "custom", message: "Inconsistent radar response" });
  }
  if (r.comparison && (r.radars.length !== 1 || !r.comparison.comparisonKey ||
      r.comparison.comparisonKey !== r.radars[0].comparisonKey ||
      r.comparison.profile !== r.radars[0].profile || r.comparison.playerId === r.playerId)) {
    ctx.addIssue({ code: "custom", message: "Incompatible comparison" });
  }
});
export type PlayerRadarResponseDto = z.infer<typeof radarResponseShape>;
