import footballLogoFallbacks from "./footballLogoFallbacks.json";
import teamsMasterFile from "../../../assets/teams_master.json";

export type ClubMedia = {
  name: string;
  badge: string;
  fallbackBadges?: readonly string[];
};

const CLUB_CODE_NAMES: Record<string, string> = {
  BAR: "Barcelona",
  RMA: "Real Madrid",
  MAD: "Real Madrid",
  ATM: "Atlético",
  ATH: "Athletic",
  BET: "Betis",
  CEL: "Celta",
  ESP: "Espanyol",
  GET: "Getafe",
  GIR: "Girona",
  LPA: "Palmas",
  LEG: "Leganés",
  MLL: "Mallorca",
  OSA: "Osasuna",
  RAY: "Rayo",
  RSO: "Sociedad",
  SEV: "Sevilla",
  VAL: "Valencia",
  VIL: "Villarreal",
  ALA: "Alavés",
  DEP: "Deportivo La Coruña",
  ELC: "Elche",
  MLG: "Malaga FC",
  VLL: "Valladolid",
  LEV: "Levante",
  RAC: "Racing",
  PSG: "PSG",
};

const TEAM_ALIASES: Record<string, string> = {
  barca: "FC Barcelona",
  barcelona: "FC Barcelona",
  atletico: "Atlético de Madrid",
  "atletico madrid": "Atlético de Madrid",
  athletic: "Athletic Club",
  betis: "Real Betis",
  celta: "Celta",
  espanyol: "RCD Espanyol",
  getafe: "Getafe CF",
  elche: "Elche CF",
  rayo: "Rayo Vallecano",
  girona: "Girona FC",
  leganes: "CD Leganés",
  valladolid: "Real Valladolid CF",
  sociedad: "Real Sociedad",
  sevilla: "Sevilla FC",
  alaves: "Deportivo Alavés",
  palmas: "UD Las Palmas",
  mallorca: "RCD Mallorca",
  osasuna: "CA Osasuna",
  valencia: "Valencia CF",
  villarreal: "Villarreal CF",
  levante: "Levante UD",
  racing: "R. Racing Club",
  malaga: "Málaga CF",
  "malaga fc": "Málaga CF",
  cordoba: "Córdoba CF",
};

// Crest URLs and names are read from saved FutbolFantasy fixture markup.
const EXTERNAL_TEAM_MEDIA: Record<string, ClubMedia> = {
  feyenoord: {
    name: "Feyenoord",
    badge: "https://static.futbolfantasy.com/uploads/images/equipos/escudom/575.png",
  },
  galatasaray: {
    name: "Galatasaray",
    badge: "https://static.futbolfantasy.com/uploads/images/equipos/escudom/509.png",
  },
  psg: {
    name: "PSG",
    badge: "https://static.futbolfantasy.com/uploads/images/equipos/escudom/520.png",
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function idText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function normalizedClubName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]/g, "");
}

function buildClubMediaIndexes(): {
  byId: ReadonlyMap<string, ClubMedia>;
  byName: ReadonlyMap<string, ClubMedia>;
} {
  const byId = new Map<string, ClubMedia>();
  const byName = new Map<string, ClubMedia>();
  const shortNameMedia = new Map<string, ClubMedia>();
  const ambiguousShortNames = new Set<string>();
  if (!Array.isArray(teamsMasterFile)) return { byId, byName };

  for (const team of teamsMasterFile) {
    const record = asRecord(team);
    const name = text(record?.name) ?? text(record?.shortName);
    const badge = text(record?.badgeColor) ?? text(record?.badgeWhite);
    if (!name || !badge) continue;

    const media = { name, badge };
    byName.set(normalizedClubName(name), media);
    const slug = text(record?.slug);
    if (slug) byName.set(normalizedClubName(slug), media);
    for (const id of [idText(record?.id), idText(record?.dspId)]) {
      if (id) byId.set(id, media);
    }

    const shortName = text(record?.shortName);
    if (!shortName) continue;
    const shortKey = normalizedClubName(shortName);
    const existing = shortNameMedia.get(shortKey);
    if (existing && existing.badge !== badge) {
      shortNameMedia.delete(shortKey);
      ambiguousShortNames.add(shortKey);
    } else if (!ambiguousShortNames.has(shortKey)) {
      shortNameMedia.set(shortKey, media);
    }
  }

  for (const [shortName, media] of shortNameMedia) byName.set(shortName, media);
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    const media = byName.get(normalizedClubName(canonical));
    if (media) byName.set(normalizedClubName(alias), media);
  }
  for (const [alias, media] of Object.entries(EXTERNAL_TEAM_MEDIA)) {
    byName.set(normalizedClubName(alias), media);
  }
  return { byId, byName };
}

const CLUB_MEDIA = buildClubMediaIndexes();

/** Expands a known club code and otherwise returns its trimmed display value. */
export function clubDisplayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Z]{2,4}$/.test(trimmed)) return CLUB_CODE_NAMES[trimmed] ?? trimmed;
  return trimmed;
}

/** Resolves a club name and crest from a Fantasy team id. */
export function clubMediaFromId(teamId: unknown): ClubMedia | null {
  const id = idText(teamId);
  const media = id ? CLUB_MEDIA.byId.get(id) : null;
  return media ? clubMediaFromFixture(media) : null;
}

/** Resolves fixture team names, direct crests, and known aliases to display media. */
export function clubMediaFromFixture(value: unknown): ClubMedia | null {
  const record = asRecord(value);
  const raw =
    text(record?.name) ??
    text(record?.shortName) ??
    text(record?.displayName) ??
    text(record?.teamName) ??
    text(value);
  if (!raw) return null;
  const directBadge =
    text(record?.badge) ??
    text(record?.badgeColor) ??
    text(record?.logo) ??
    text(record?.crest) ??
    text(record?.image);
  const name = clubDisplayName(raw) ?? raw;
  const catalog = CLUB_MEDIA.byName.get(normalizedClubName(name));
  const fallback = fallbackLogo("club", catalog?.name ?? name) ?? fallbackLogo("club", raw);
  const sources = badgeSources(directBadge, catalog?.badge, ...(catalog?.fallbackBadges ?? []), fallback);
  if (!sources.length) return null;
  return { name: catalog?.name ?? name, badge: sources[0], fallbackBadges: sources.slice(1) };
}

function fallbackLogo(kind: "club" | "competition", name: string): string | undefined {
  const key = normalizedClubName(name);
  return footballLogoFallbacks.find((entry) => entry.kind === kind &&
    [entry.name, ...entry.aliases].some((alias) => normalizedClubName(alias) === key))?.localPath;
}

/** Accept upstream HTTP images and curated local assets, never arbitrary URL schemes. */
export function badgeSources(...values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" &&
    (/^https?:\/\//i.test(value) || /^\/badges\/football-logos\/[a-z0-9-]+\.png$/.test(value))))];
}

/** Keep a fixture's published image ahead of catalog and local fallback sources. */
export function fixtureClubMedia(fixture: Record<string, unknown> | null, side: "home" | "away"): ClubMedia | null {
  const value = fixture?.[`${side}Team`];
  const record = asRecord(value);
  const name = text(record?.name) ?? text(value);
  const media = clubMediaFromFixture(value);
  const opponentSide = fixture?.isHome === true ? "away" : fixture?.isHome === false ? "home" : null;
  const sources = badgeSources(fixture?.[`${side}Badge`], side === opponentSide ? fixture?.opponentBadge : null,
    media?.badge, ...(media?.fallbackBadges ?? []));
  return sources.length ? { name: media?.name ?? name ?? side, badge: sources[0], fallbackBadges: sources.slice(1) } : null;
}

/** Resolve a competition by exact known identity, preserving any published badge first. */
export function competitionMedia(fixture: Record<string, unknown> | null): ClubMedia | null {
  const label = text(fixture?.competitionLabel) ?? text(fixture?.competition) ?? "";
  const fallback = fallbackLogo("competition", label) ?? fallbackLogo("competition", text(fixture?.competition) ?? "");
  const sources = badgeSources(fixture?.competitionBadge, fallback);
  return sources.length ? { name: label, badge: sources[0], fallbackBadges: sources.slice(1) } : null;
}

/** Recover catalog identity for badge-only player cards before trying local fallbacks. */
export function clubMediaFromBadge(value: string | null | undefined): ClubMedia | null {
  if (!value) return null;
  const known = [...CLUB_MEDIA.byId.values()].find((media) => media.badge === value);
  return known ? clubMediaFromFixture(known) : badgeSources(value).length ? { name: "Club", badge: value } : null;
}
