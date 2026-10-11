import teamsMasterFile from "../../../../assets/teams_master.json";
import { asFiniteNumber, asRecord, text } from "../../api/mappers";

export type WeatherCondition =
  | "clear"
  | "few_clouds"
  | "scattered_clouds"
  | "broken_clouds"
  | "overcast"
  | "drizzle"
  | "rain"
  | "shower_rain"
  | "thunderstorm"
  | "snow"
  | "mist";

export type MatchOutcome = "win" | "loss" | "draw" | "unknown";

const WEATHER_ICON_BY_PREFIX: Record<string, WeatherCondition> = {
  "01": "clear",
  "02": "few_clouds",
  "03": "scattered_clouds",
  "04": "broken_clouds",
  "09": "shower_rain",
  "10": "rain",
  "11": "thunderstorm",
  "13": "snow",
  "50": "mist",
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

// Crest URLs and names are read from the saved FutbolFantasy fixture markup.
const EXTERNAL_TEAM_MEDIA: Record<string, { name: string; badge: string }> = {
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

function normalizedTeamName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]/g, "");
}

function buildTeamMediaIndex(): ReadonlyMap<string, { name: string; badge: string }> {
  const index = new Map<string, { name: string; badge: string }>();
  const shortNameMedia = new Map<string, { name: string; badge: string }>();
  const ambiguousShortNames = new Set<string>();
  if (!Array.isArray(teamsMasterFile)) return index;

  for (const team of teamsMasterFile) {
    const record = asRecord(team);
    const name = text(record?.name) ?? text(record?.shortName);
    const badge = text(record?.badgeColor) ?? text(record?.badgeWhite);
    if (!name || !badge) continue;

    index.set(normalizedTeamName(name), { name, badge });
    const slug = text(record?.slug);
    if (slug) index.set(normalizedTeamName(slug), { name, badge });
    const shortName = text(record?.shortName);
    if (shortName) {
      const shortKey = normalizedTeamName(shortName);
      const existing = shortNameMedia.get(shortKey);
      if (existing && existing.badge !== badge) {
        shortNameMedia.delete(shortKey);
        ambiguousShortNames.add(shortKey);
      } else if (!ambiguousShortNames.has(shortKey)) {
        shortNameMedia.set(shortKey, { name, badge });
      }
    }
  }

  for (const [shortName, team] of shortNameMedia) index.set(shortName, team);
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    const team = index.get(normalizedTeamName(canonical));
    if (team) index.set(normalizedTeamName(alias), team);
  }
  for (const [alias, team] of Object.entries(EXTERNAL_TEAM_MEDIA)) {
    index.set(normalizedTeamName(alias), team);
  }
  return index;
}

const TEAM_MEDIA = buildTeamMediaIndex();

export function teamMediaFromFixture(value: unknown): { name: string; badge: string } | null {
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
  if (directBadge && /^https?:\/\//i.test(directBadge)) return { name: raw, badge: directBadge };
  return TEAM_MEDIA.get(normalizedTeamName(raw)) ?? null;
}

export function matchOutcome(homeScore: number | null, awayScore: number | null): MatchOutcome {
  if (homeScore == null || awayScore == null) return "unknown";
  if (homeScore === awayScore) return "draw";
  return homeScore > awayScore ? "win" : "loss";
}

export function weatherConditionFromSnapshot(
  snapshot: Record<string, unknown> | null,
): WeatherCondition | null {
  const code = asFiniteNumber(snapshot?.condition_code);
  if (code != null) {
    if (code === 800) return "clear";
    if (code === 801) return "few_clouds";
    if (code === 802) return "scattered_clouds";
    if (code === 803) return "broken_clouds";
    if (code === 804) return "overcast";
    if (code >= 200 && code < 300) return "thunderstorm";
    if (code >= 300 && code < 400) return "drizzle";
    if (code >= 500 && code < 600) {
      return code >= 520 ? "shower_rain" : "rain";
    }
    if (code >= 600 && code < 700) return "snow";
    if (code >= 700 && code < 800) return "mist";
  }

  const prefix = text(snapshot?.icon)?.slice(0, 2);
  return prefix ? WEATHER_ICON_BY_PREFIX[prefix] ?? null : null;
}

export function fixtureDate(value: unknown): string {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : "Date TBC";
}

export function sortMatchesByDate(matches: unknown[], direction: "asc" | "desc"): unknown[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return matches
    .map((match, index) => ({
      match,
      index,
      date: text(asRecord(asRecord(match)?.fixture)?.date) ?? text(asRecord(match)?.kickoff),
    }))
    .sort((left, right) => {
      const leftDate = left.date ? Date.parse(left.date) : NaN;
      const rightDate = right.date ? Date.parse(right.date) : NaN;
      if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) {
        return (leftDate - rightDate) * multiplier;
      }
      if (Number.isFinite(leftDate) !== Number.isFinite(rightDate)) {
        return Number.isFinite(leftDate) ? -1 : 1;
      }
      return left.index - right.index;
    })
    .map(({ match }) => match);
}

export function newsDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const dateOnly = raw.slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return dateOnly;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
