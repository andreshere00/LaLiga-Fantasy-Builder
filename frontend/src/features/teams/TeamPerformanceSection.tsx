import { t, useTranslation } from "../../i18n";
import { dateFormatter } from "../../i18n/format";
import { BadgeImage } from "../../components/BadgeImage";
import type { ClubDossierDto } from "../../api/schemas";
import {
  competitionLabel,
  matchWindow,
  nextMatchId,
  scoreText,
  summarize,
  withClubNames,
  type ClubMatchView,
  type NamedClub,
} from "./teamPerformance";
import type { TeamCompetition, TeamWindow } from "./teamRoutes";
import "../players/playerDetailWidgets.css";

const FILTERS: TeamCompetition[] = ["laliga", "european", "domestic", "friendly", "all"];
const WINDOWS: { id: TeamWindow; label: string }[] = [
  { id: "5", label: "5" },
  { id: "10", label: "10" },
  { id: "20", label: "20" },
  { id: "season", label: "Whole season" },
];

type Performance = NonNullable<ClubDossierDto["performance"]>;

export function TeamPerformanceSection({
  performance,
  clubs,
  competition,
  window,
  failed,
  onCompetition,
  onWindow,
  onRetry,
}: {
  performance: Performance | null;
  clubs: readonly NamedClub[];
  competition: TeamCompetition;
  window: TeamWindow;
  failed: boolean;
  onCompetition: (value: TeamCompetition) => void;
  onWindow: (value: TeamWindow) => void;
  onRetry: () => void;
}) {
  useTranslation();
  const matches = (performance?.matches ?? []).map((match) => withClubNames(asView(match), clubs));
  const view = matchWindow(matches, competition, window);
  const summary = summarize(view.previous);
  const nextId = nextMatchId(view.upcoming);
  const label = competitionLabel(competition);
  return (
    <section
      id="team-performance"
      className="player-match-section"
      tabIndex={-1}
      aria-labelledby="team-performance-title"
    >
      <h2 id="team-performance-title" className="player-section-title">{t("Performance")}</h2>
      <div className="team-filter" role="group" aria-label={t("Competition")}>
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={competition === item}
            onClick={() => onCompetition(item)}
          >
            {t(competitionLabel(item))}
          </button>
        ))}
      </div>
      <div className="team-filter" role="group" aria-label={t("Match window")}>
        {WINDOWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={window === item.id}
            onClick={() => onWindow(item.id)}
          >
            {item.id === "season" ? t(item.label) : item.label}
          </button>
        ))}
      </div>
      {failed ? (
        <p role="alert">
          {t("Other competitions are unavailable.")}
          <button type="button" onClick={onRetry}>{t("Retry")}</button>
        </p>
      ) : null}
      {performance == null ? (
        failed ? null : <p>{t("Results are not published for this club.")}</p>
      ) : view.filtered.length === 0 ? (
        <p className="player-match-empty">
          {t("No {{0}} matches in this window.", { 0: t(label) })}
          {competition !== "all" ? (
            <button type="button" onClick={() => onCompetition("all")}>
              {t("Show all competitions")}
            </button>
          ) : null}
        </p>
      ) : (
        <>
          <ResultSummary summary={summary} />
          <MatchList title={t("Previous matches")} matches={view.previous} nextId={null} />
          <MatchList title={t("Upcoming matches")} matches={view.upcoming} nextId={nextId} />
        </>
      )}
    </section>
  );
}

function ResultSummary({ summary }: { summary: ReturnType<typeof summarize> }) {
  const difference = summary.goalsFor - summary.goalsAgainst;
  return (
    <div className="team-record">
      <p className="team-record-primary">
        <span><strong>{summary.won}</strong> {t("Win")}</span>
        <span><strong>{summary.drawn}</strong> {t("Draw")}</span>
        <span><strong>{summary.lost}</strong> {t("Loss")}</span>
      </p>
      <p className="team-record-split">
        <span>{t("Home")} {summary.home.won}-{summary.home.drawn}-{summary.home.lost}</span>
        <span>{t("Away")} {summary.away.won}-{summary.away.drawn}-{summary.away.lost}</span>
      </p>
      <p className="team-record-goals">
        <span>{t("Goals scored")} {summary.goalsFor}</span>
        <span>{t("Goals conceded")} {summary.goalsAgainst}</span>
        <span>{t("Goals difference")} {difference > 0 ? `+${difference}` : difference}</span>
      </p>
    </div>
  );
}

function MatchList({
  title, matches, nextId,
}: {
  title: string;
  matches: ClubMatchView[];
  nextId: string | null;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="player-match-group">
      <h3>{title}</h3>
      <ul className="player-match-grid">
        {matches.map((match) => (
          <MatchCard key={match.matchId} match={match} next={match.matchId === nextId} />
        ))}
      </ul>
    </div>
  );
}

function MatchCard({ match, next }: { match: ClubMatchView; next: boolean }) {
  const score = scoreText(match);
  const when = matchDate(match);
  const outcome = match.outcome === "win" ? "Win"
    : match.outcome === "draw" ? "Draw"
      : match.outcome === "loss" ? "Loss" : null;
  return (
    <li className={[
      "player-match-card",
      outcome ? `is-${match.outcome}` : "",
      next ? "is-next" : "",
    ].filter(Boolean).join(" ")}>
      <p className="player-match-competition">{match.competition}</p>
      {next ? <p className="team-next-label">{t("Next match")}</p> : null}
      <div className="player-match-teams">
        <Side name={match.home} badge={match.homeBadge} />
        <Side name={match.away} badge={match.awayBadge} />
      </div>
      {score ? (
        <p className="player-match-result">
          <strong>{score}</strong>
          {outcome ? <span>{t(outcome)}</span> : null}
        </p>
      ) : null}
      {when ? (
        <time className="player-match-date" dateTime={match.kickoff ?? undefined}>{when}</time>
      ) : null}
      {match.roundLabel ? <p className="player-match-player-stats">{match.roundLabel}</p> : null}
    </li>
  );
}

function Side({ name, badge }: { name: string; badge: string | null }) {
  return (
    <div className="player-match-team">
      <div className="player-match-crest-tile">
        <BadgeImage media={{ name, badge: badge ?? "" }} />
      </div>
      <span className="player-match-team-name">{name}</span>
    </div>
  );
}

function matchDate(match: ClubMatchView): string | null {
  if (match.kickoff) {
    const parsed = new Date(match.kickoff);
    if (Number.isFinite(parsed.getTime())) {
      return dateFormatter({
        day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid",
      }).format(parsed);
    }
  }
  return match.kickoffText;
}

function asView(match: Performance["matches"][number]): ClubMatchView {
  return {
    matchId: match.matchId,
    group: match.group,
    competition: match.competition,
    home: match.home,
    away: match.away,
    homeBadge: match.homeBadge ?? null,
    awayBadge: match.awayBadge ?? null,
    kickoff: match.kickoff ?? null,
    kickoffText: match.kickoffText ?? null,
    roundLabel: match.roundLabel ?? null,
    regulationHome: match.regulationHome ?? null,
    regulationAway: match.regulationAway ?? null,
    finalHome: match.finalHome ?? null,
    finalAway: match.finalAway ?? null,
    outcome: match.outcome ?? null,
    venue: match.venue ?? "home",
    scheduled: match.scheduled ?? false,
  };
}
