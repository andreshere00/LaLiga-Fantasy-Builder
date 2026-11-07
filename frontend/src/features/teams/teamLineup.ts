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

export function catalogNames(payload: unknown): CatalogName[] {
  const names: CatalogName[] = [];
  for (const [playerId, master] of catalogById(payload)) {
    const name = text(master.name);
    if (!name) continue;
    names.push({ playerId, name, nickname: text(master.nickname) });
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
