import { text } from "../../api/mappers";
import { catalogById } from "../market/model/listing";

export type PredictedPlayer = {
  name: string;
  photoUrl: string | null;
  probability: number | null;
  position: string | null;
  profileUrl: string | null;
};

export type CatalogName = {
  playerId: string;
  name: string;
  nickname: string | null;
};

export function orderedAlternatives<T extends { probability: number | null }>(
  players: readonly T[],
): T[] {
  return [...players].sort((left, right) => (right.probability ?? -1) - (left.probability ?? -1));
}

export function alternativesBySlot<T extends { position: string | null }>(
  players: readonly T[],
): { position: string; players: T[] }[] {
  const groups: { position: string; players: T[] }[] = [];
  for (const player of players) {
    const position = player.position ?? "";
    const group = groups.find((item) => item.position === position);
    if (group) group.players.push(player);
    else groups.push({ position, players: [player] });
  }
  return groups;
}

/** One catalog player, or none when the scraped name is missing or ambiguous. */
export function matchCatalogPlayer(
  scrapedName: string,
  catalog: readonly CatalogName[],
): string | null {
  const target = fold(scrapedName);
  if (!target) return null;
  const hits = catalog.filter((player) => (
    fold(player.name) === target || fold(player.nickname ?? "") === target
  ));
  return hits.length === 1 ? hits[0].playerId : null;
}

/**
 * One club squad member for a scraped XI name, or none when the match is missing or ambiguous.
 * The XI abbreviates names ("I. Williams", "Sancet") that the squad spells in full
 * ("Iñaki Williams", "O. Sancet"), so a leading initial and a trailing surname both count.
 */
export function matchRosterPlayer<T extends { name: string }>(
  scrapedName: string,
  squad: readonly T[],
): T | null {
  const target = fold(scrapedName);
  if (!target) return null;
  const exact = squad.filter((player) => fold(player.name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const words = target.split(" ");
  const initial = words.length > 1 && words[0].length === 1 ? words[0] : null;
  const rest = initial ? words.slice(1).join(" ") : target;
  const hits = squad.filter((player) => {
    const name = fold(player.name);
    if (initial) return name === rest || (name.endsWith(` ${rest}`) && name.startsWith(initial));
    return name.endsWith(` ${rest}`);
  });
  return hits.length === 1 ? hits[0] : null;
}

export function catalogNames(payload: unknown): CatalogName[] {
  const names: CatalogName[] = [];
  for (const [playerId, master] of catalogById(payload)) {
    const nickname = text(master.nickname);
    const name = text(master.name) ?? nickname;
    if (!name) continue;
    names.push({ playerId, name, nickname });
  }
  return names;
}

export function fieldPlayerPath(playerId: string, teamId: string | null): string {
  const params = new URLSearchParams({ focusPlayer: playerId });
  if (teamId) params.set("team", teamId);
  return `/?${params.toString()}`;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
