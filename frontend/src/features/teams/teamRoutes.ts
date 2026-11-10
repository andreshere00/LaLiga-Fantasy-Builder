export const TEAM_SECTIONS = ["performance", "players", "lineup", "news"] as const;
/** The section a club opens on: the first one in the bar, so no `section` param is needed. */
export const DEFAULT_SECTION = "performance" as const;
export const TEAM_COMPETITIONS = ["laliga", "european", "domestic", "friendly", "all"] as const;
export const TEAM_WINDOWS = ["5", "10", "20", "season"] as const;

export type TeamSection = (typeof TEAM_SECTIONS)[number];
export type TeamCompetition = (typeof TEAM_COMPETITIONS)[number];
export type TeamWindow = (typeof TEAM_WINDOWS)[number];

export type TeamClub = { clubId: number; name: string };

export type TeamRouteState = {
  section: TeamSection;
  competition: TeamCompetition;
  window: TeamWindow;
};

const SECTION_IDS: Record<TeamSection, string> = {
  players: "team-players",
  performance: "team-performance",
  lineup: "team-lineup",
  news: "team-news",
};

export function teamSectionId(section: TeamSection): string {
  return SECTION_IDS[section];
}

export function teamSearch(params: URLSearchParams): TeamRouteState {
  const section = params.get("section");
  const competition = params.get("competition");
  const window = params.get("window");
  return {
    section: isOne(TEAM_SECTIONS, section) ? section : DEFAULT_SECTION,
    competition: isOne(TEAM_COMPETITIONS, competition) ? competition : "laliga",
    window: isOne(TEAM_WINDOWS, window) ? window : "5",
  };
}

export function teamPath(clubId: number | string, state: TeamRouteState): string {
  const params = new URLSearchParams();
  if (state.section !== DEFAULT_SECTION) params.set("section", state.section);
  if (state.competition !== "laliga") params.set("competition", state.competition);
  if (state.window !== "5") params.set("window", state.window);
  const query = params.toString();
  return `/teams/${clubId}${query ? `?${query}` : ""}`;
}

/** Id of the hierarchy block on the Players section; a link with this hash opens the level list. */
export const TEAM_HIERARCHY_ANCHOR = "team-hierarchy";

/** A club's Teams page with default filters, optionally opened on a section or the hierarchy list. */
export function clubTeamPath(clubId: number | string, target: TeamSection | "hierarchy" = DEFAULT_SECTION): string {
  const section = target === "hierarchy" ? "players" : target;
  const path = teamPath(clubId, { section, competition: "laliga", window: "5" });
  return target === "hierarchy" ? `${path}#${TEAM_HIERARCHY_ANCHOR}` : path;
}

export function initialClubId(
  clubs: readonly TeamClub[],
  locale: string,
  hint?: { opponentClubId?: number | null },
): number | null {
  if (hint?.opponentClubId != null && clubs.some((club) => club.clubId === hint.opponentClubId)) {
    return hint.opponentClubId;
  }
  return [...clubs].sort((left, right) => left.name.localeCompare(right.name, locale))[0]?.clubId ?? null;
}

function isOne<T extends string>(values: readonly T[], value: string | null): value is T {
  return value != null && values.some((item) => item === value);
}
