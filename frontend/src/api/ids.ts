export type MasterPlayerId = string & { readonly __masterPlayerId: unique symbol };
export type SquadPlayerId = string & { readonly __squadPlayerId: unique symbol };

/** Parses a catalog master id from upstream JSON. */
export function parseMasterPlayerId(raw: unknown): MasterPlayerId | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!/^[0-9]{1,10}$/.test(text)) return null;
  return text as MasterPlayerId;
}

/** Parses a league squad-entry id from upstream JSON. */
export function parseSquadPlayerId(raw: unknown): SquadPlayerId | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  return text as SquadPlayerId;
}

export function masterPlayerIdToString(id: MasterPlayerId): string {
  return id;
}

export function squadPlayerIdToString(id: SquadPlayerId): string {
  return id;
}
