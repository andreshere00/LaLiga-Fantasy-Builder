import { z } from "zod";

const date = z.iso.datetime({ offset: true });
export const watchSchema = z.object({
  marketAlert: z.boolean(), clauseAlert: z.boolean(), leadHours: z.union([z.literal(1), z.literal(6), z.literal(24)]),
}).strict();
export type Watch = z.infer<typeof watchSchema>;
export const observationSchema = z.object({
  name: z.string(), listings: z.array(z.string()), ownerId: z.string().nullable(),
  ownerName: z.string().nullable(), playerTeamId: z.string().nullable(),
  unlockAt: date.nullable(), shielded: z.boolean().nullable(), clause: z.number().nullable(),
  clauseEnabled: z.boolean(), rival: z.boolean(), available: z.boolean(), checkedAt: date,
  cycle: z.string(), episode: z.string(),
});
const favoriteSchema = z.object({
  playerId: z.string(), createdAt: date, watch: watchSchema.nullable(), observation: observationSchema.nullable(),
});
export const favoritesSchema = z.object({
  favorites: z.array(favoriteSchema),
  status: z.enum(["inactive", "active", "needs_reauth", "not_member", "degraded"]), checkedAt: date.nullable(),
});
export type Favorite = z.infer<typeof favoriteSchema>;
export const notificationSchema = z.object({
  id: z.string().regex(/^[0-9]+$/), leagueId: z.string(), leagueName: z.string(),
  playerId: z.string(), playerName: z.string(), kind: z.enum(["market", "clause_soon", "clause_available"]),
  createdAt: date, readAt: date.nullable(),
});
export const inboxSchema = z.object({
  notifications: z.array(notificationSchema), unreadCount: z.number().int().nonnegative(), nextCursor: z.string().nullable(),
});
export const resultSchema = z.object({ ok: z.literal(true) });

export const favoritesImportSchema = z.object({ playerIds: z.array(z.string().regex(/^[0-9]{1,10}$/)).max(1000) }).strict();
export const favoritesQuerySchema = z.object({ leagueId: z.string().min(1).max(128).optional() }).strict();
export const inboxQuerySchema = favoritesQuerySchema.extend({
  cursor: z.string().regex(/^[1-9][0-9]*$/).optional(), limit: z.number().int().min(1).max(100).optional(),
});
