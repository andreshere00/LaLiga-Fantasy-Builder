const STORAGE_PREFIX = "lfb-player-favorites:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** Reads favorite master player ids for one signed-in user. */
export function readFavoritePlayerIds(userId: string | null): ReadonlySet<string> {
  if (!userId || typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function writeFavoritePlayerIds(userId: string | null, ids: ReadonlySet<string>): void {
  if (!userId || typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
}

/** Market row class when the player is bookmarked. */
export function favoriteMarketRowClass(
  playerId: string | null | undefined,
  favorites: ReadonlySet<string>,
): string | undefined {
  if (playerId && favorites.has(playerId)) return "is-favorite";
  return undefined;
}

export function toggleFavoritePlayerId(
  userId: string | null,
  playerId: string,
): ReadonlySet<string> {
  const current = new Set(readFavoritePlayerIds(userId));
  if (current.has(playerId)) current.delete(playerId);
  else current.add(playerId);
  writeFavoritePlayerIds(userId, current);
  return current;
}
