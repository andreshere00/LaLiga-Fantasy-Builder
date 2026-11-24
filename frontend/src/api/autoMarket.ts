import { z } from "zod";

const date = z.iso.datetime({ offset: true });
const side = z.enum(["sell", "buy"]);
const target = z.enum(["market", "clause"]);
const triggerKind = z.enum(["relative", "absolute", "none"]);
const priceMode = z.enum(["threshold", "market_value"]);
const amount = z.number().int().positive().max(999_999_999);
const identifier = z.string().min(1).max(128).regex(/^[^/\s?#]+$/);

export const AUTO_RULE_STATES = ["armed", "listed", "executing", "executed", "failed", "cancelled", "expired"] as const;
export const autoRuleStateSchema = z.enum(AUTO_RULE_STATES);
export type AutoRuleState = z.infer<typeof autoRuleStateSchema>;

/** Armed rule body; `extra="forbid"` upstream, so optional fields are omitted rather than null. */
export const autoRuleWriteSchema = z.object({
  side, target, playerId: z.string().regex(/^[0-9]{1,10}$/),
  playerTeamId: identifier.optional(),
  triggerKind,
  triggerPercent: z.number().min(0.1).max(500).optional(),
  triggerAmount: amount.optional(),
  priceMode,
  bidAmount: amount.optional(),
  maxSpend: amount.optional(),
  expiresAt: date.optional(),
  listNow: z.boolean().optional(),
}).strict();
export type AutoRuleWrite = z.infer<typeof autoRuleWriteSchema>;

export const autoExecutionSchema = z.object({
  id: z.number().int(), ruleId: z.number().int(),
  action: z.enum(["list", "accept_offer", "bid", "pay_clause", "expire", "skip"]),
  amount: z.number().nullable(), outcome: z.enum(["ok", "failed", "skipped"]),
  reason: z.string().nullable(), createdAt: date,
});
export type AutoExecution = z.infer<typeof autoExecutionSchema>;

export const autoRuleSchema = z.object({
  id: z.number().int(), leagueId: z.string(), side, target,
  playerId: z.string(), playerTeamId: z.string().nullable(), playerName: z.string(),
  triggerKind, triggerPercent: z.number().nullable(), triggerAmount: z.number().nullable(),
  baselineValue: z.number(), thresholdAmount: z.number(), priceMode,
  bidAmount: z.number().nullable(), maxSpend: z.number().nullable(),
  listNow: z.boolean().optional(),
  state: autoRuleStateSchema, armedAt: date, expiresAt: date.nullable(),
  listedPrice: z.number().nullable(), acceptFloor: z.number().nullable(), listedAt: date.nullable(),
  lastExecution: autoExecutionSchema.nullable(),
});
export type AutoRule = z.infer<typeof autoRuleSchema>;

export const autoRulesSchema = z.object({
  rules: z.array(autoRuleSchema),
  status: z.enum(["inactive", "active", "needs_reauth", "not_member", "degraded"]),
  checkedAt: date.nullable(),
});
export type AutoRules = z.infer<typeof autoRulesSchema>;
export const autoExecutionsSchema = z.object({ executions: z.array(autoExecutionSchema) });
export const autoResultSchema = z.object({ ok: z.literal(true) });
export const autoExecutionsQuerySchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict();
