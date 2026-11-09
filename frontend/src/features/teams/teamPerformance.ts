import type { TeamCompetition, TeamWindow } from "./teamRoutes";

export type ClubMatchView = {
  matchId: string;
  group: "laliga" | "european" | "domestic" | "friendly";
  competition: string;
  home: string;
  away: string;
  homeBadge: string | null;
  awayBadge: string | null;
  kickoff: string | null;
  kickoffText: string | null;
  roundLabel: string | null;
  regulationHome: number | null;
  regulationAway: number | null;
  finalHome: number | null;
  finalAway: number | null;
  outcome: "win" | "draw" | "loss" | null;
  venue: "home" | "away";
  scheduled: boolean;
};

export type NamedClub = { clubId: number; name: string; badgeUrl?: string | null };

export type MatchWindow = {
  previous: ClubMatchView[];
  upcoming: ClubMatchView[];
  filtered: ClubMatchView[];
};

export type ResultSummary = {
  won: number;
  drawn: number;
  lost: number;
  home: { won: number; drawn: number; lost: number };
  away: { won: number; drawn: number; lost: number };
  goalsFor: number;
  goalsAgainst: number;
};

const FILTER_LABELS: Record<TeamCompetition, string> = {
  laliga: "LaLiga",
  european: "European",
  domestic: "Domestic",
  friendly: "Friendlies",
  all: "All competitions",
};

export function competitionLabel(competition: TeamCompetition): string {
  return FILTER_LABELS[competition];
}

/** Human label for a provider competition id such as `laliga` or `champions_league`. */
export function competitionName(raw: string): string {
  if (raw.toLowerCase() === "laliga") return "LaLiga";
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function withClubNames(match: ClubMatchView, clubs: readonly NamedClub[]): ClubMatchView {
  const home = namedSide(match.home, match.homeBadge, clubs);
  const away = namedSide(match.away, match.awayBadge, clubs);
  return {
    ...match,
    home: home.name,
    away: away.name,
    homeBadge: home.badge,
    awayBadge: away.badge,
  };
}

export function matchWindow(
  matches: readonly ClubMatchView[],
  competition: TeamCompetition,
  window: TeamWindow,
): MatchWindow {
  const filtered = competition === "all"
    ? [...matches]
    : matches.filter((match) => match.group === competition);
  const finished = filtered.filter((match) => !match.scheduled).sort(byKickoff);
  const upcoming = filtered.filter((match) => match.scheduled).sort(byKickoff);
  if (window === "season") return { previous: finished.reverse(), upcoming, filtered };
  const count = Number(window);
  return {
    previous: finished.slice(-count).reverse(),
    upcoming: upcoming.slice(0, count),
    filtered,
  };
}

export function summarize(matches: readonly ClubMatchView[]): ResultSummary {
  const summary: ResultSummary = {
    won: 0, drawn: 0, lost: 0,
    home: { won: 0, drawn: 0, lost: 0 },
    away: { won: 0, drawn: 0, lost: 0 },
    goalsFor: 0, goalsAgainst: 0,
  };
  for (const match of matches) {
    if (match.scheduled || match.outcome == null) continue;
    if (match.regulationHome == null || match.regulationAway == null) continue;
    const venue = match.venue === "away" ? summary.away : summary.home;
    venue[match.outcome === "win" ? "won" : match.outcome === "draw" ? "drawn" : "lost"] += 1;
    summary.goalsFor += match.venue === "away" ? match.regulationAway : match.regulationHome;
    summary.goalsAgainst += match.venue === "away" ? match.regulationHome : match.regulationAway;
  }
  summary.won = summary.home.won + summary.away.won;
  summary.drawn = summary.home.drawn + summary.away.drawn;
  summary.lost = summary.home.lost + summary.away.lost;
  return summary;
}

export function scoreText(match: ClubMatchView): string | null {
  if (match.regulationHome == null || match.regulationAway == null) return null;
  const home = sideScore(match.regulationHome, match.finalHome);
  const away = sideScore(match.regulationAway, match.finalAway);
  return `${home} – ${away}`;
}

export function nextMatchId(upcoming: readonly ClubMatchView[]): string | null {
  return upcoming[0]?.matchId ?? null;
}

function sideScore(regulation: number, final: number | null): string {
  return final == null ? String(regulation) : `${regulation} (${final})`;
}

function namedSide(value: string, badge: string | null, clubs: readonly NamedClub[]) {
  if (!/^\d+$/.test(value)) return { name: value, badge };
  const club = clubs.find((item) => String(item.clubId) === value);
  return { name: club?.name ?? value, badge: badge ?? club?.badgeUrl ?? null };
}

function byKickoff(left: ClubMatchView, right: ClubMatchView): number {
  const leftTime = Date.parse(left.kickoff ?? "");
  const rightTime = Date.parse(right.kickoff ?? "");
  const leftKnown = Number.isFinite(leftTime);
  const rightKnown = Number.isFinite(rightTime);
  if (leftKnown && rightKnown && leftTime !== rightTime) return leftTime - rightTime;
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  return left.matchId.localeCompare(right.matchId);
}
