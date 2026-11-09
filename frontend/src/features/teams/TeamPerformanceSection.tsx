import { t, useTranslation } from "../../i18n";
import { dateFormatter } from "../../i18n/format";
import { BadgeImage } from "../../components/BadgeImage";
import type { ClubDossierDto } from "../../api/schemas";
import {
  competitionLabel,
  competitionName,
  matchWindow,
  nextMatchId,
  scoreText,
  summarize,
  withClubNames,
  type ClubMatchView,
  type NamedClub,
} from "./teamPerformance";
import type { TeamCompetition, TeamWindow } from "./teamRoutes";

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
  const results = [...view.previous].reverse().filter((match) => match.outcome != null);
  return (
    <section
      id="team-performance"
      tabIndex={-1}
      aria-labelledby="team-performance-title"
    >
      <h2 id="team-performance-title" className="team-section-title">{t("Performance")}</h2>
      <div className="team-controls">
        <div className="team-control">
          <span className="team-control-label" id="team-competition-label">{t("Competition")}</span>
          <div className="team-filter" role="group" aria-labelledby="team-competition-label">
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
        </div>
        <div className="team-control">
          <span className="team-control-label" id="team-window-label">{t("Match window")}</span>
          <div className="team-filter" role="group" aria-labelledby="team-window-label">
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
        </div>
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
        <p className="team-empty">
          {t("No {{0}} matches in this window.", { 0: t(label) })}
          {competition !== "all" ? (
            <button type="button" onClick={() => onCompetition("all")}>
              {t("Show all competitions")}
            </button>
          ) : null}
        </p>
      ) : (
        <>
          <ResultSummary summary={summary} results={results} />
          <div className="team-pair">
            <MatchList
              title={t("Previous matches")}
              matches={view.previous}
              nextId={null}
              showCompetition={competition !== "laliga"}
            />
            <MatchList
              title={t("Upcoming matches")}
              matches={view.upcoming}
              nextId={nextId}
              showCompetition={competition !== "laliga"}
            />
          </div>
        </>
      )}
    </section>
  );
}

function ResultSummary({
  summary, results,
}: {
  summary: ReturnType<typeof summarize>;
  results: readonly ClubMatchView[];
}) {
  const difference = summary.goalsFor - summary.goalsAgainst;
  return (
    <div className="team-record">
      <dl className="team-record-primary">
        <div><dd>{summary.won}</dd><dt>{t("Win")}</dt></div>
        <div><dd>{summary.drawn}</dd><dt>{t("Draw")}</dt></div>
        <div><dd>{summary.lost}</dd><dt>{t("Loss")}</dt></div>
      </dl>
      {results.length > 0 ? (
        <ol className="team-form" aria-label={t("Recent results, oldest to newest")}>
          {results.map((match) => (
            <li key={match.matchId} className={`team-result team-result--${match.outcome}`}>
              <span aria-hidden="true">{resultLetter(match.outcome)}</span>
              <span className="visually-hidden">{t(resultWord(match.outcome))}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <dl className="team-record-facts">
        <div>
          <dt>{t("Home")}</dt>
          <dd>{summary.home.won}-{summary.home.drawn}-{summary.home.lost}</dd>
        </div>
        <div>
          <dt>{t("Away")}</dt>
          <dd>{summary.away.won}-{summary.away.drawn}-{summary.away.lost}</dd>
        </div>
        <div><dt>{t("Goals scored")}</dt><dd>{summary.goalsFor}</dd></div>
        <div><dt>{t("Goals conceded")}</dt><dd>{summary.goalsAgainst}</dd></div>
        <div>
          <dt>{t("Goals difference")}</dt>
          <dd>{difference > 0 ? `+${difference}` : difference}</dd>
        </div>
      </dl>
    </div>
  );
}

function resultWord(outcome: ClubMatchView["outcome"]): "Win" | "Draw" | "Loss" {
  return outcome === "win" ? "Win" : outcome === "draw" ? "Draw" : "Loss";
}

function resultLetter(outcome: ClubMatchView["outcome"]): string {
  return t(resultWord(outcome)).charAt(0).toUpperCase();
}

function MatchList({
  title, matches, nextId, showCompetition,
}: {
  title: string;
  matches: ClubMatchView[];
  nextId: string | null;
  showCompetition: boolean;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="team-match-group">
      <h3>{title}</h3>
      <ul className="team-fixtures">
        {matches.map((match) => (
          <MatchRow
            key={match.matchId}
            match={match}
            next={match.matchId === nextId}
            showCompetition={showCompetition}
          />
        ))}
      </ul>
    </div>
  );
}

function MatchRow({
  match, next, showCompetition,
}: {
  match: ClubMatchView;
  next: boolean;
  showCompetition: boolean;
}) {
  const score = scoreText(match);
  const when = matchDate(match);
  const time = score ? null : kickoffTime(match);
  const outcome = match.outcome;
  const own = match.venue === "away" ? "away" : "home";
  return (
    <li className={[
      "team-fixture",
      outcome ? `is-${outcome}` : "",
      next ? "is-next" : "",
    ].filter(Boolean).join(" ")}>
      <div className="team-fixture-when">
        {when ? <time dateTime={match.kickoff ?? undefined}>{when}</time> : null}
        {showCompetition || match.roundLabel ? (
          <span>
            {[showCompetition ? competitionName(match.competition) : null, match.roundLabel]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        {next ? <span className="team-next-label">{t("Next match")}</span> : null}
      </div>
      <div className="team-fixture-teams">
        <Side name={match.home} badge={match.homeBadge} own={own === "home"} />
        <span className="team-fixture-score">{score ?? time ?? t("vs")}</span>
        <Side name={match.away} badge={match.awayBadge} own={own === "away"} />
      </div>
      {outcome ? (
        <span className={`team-result team-result--${outcome}`}>
          <span aria-hidden="true">{resultLetter(outcome)}</span>
          <span className="visually-hidden">{t(resultWord(outcome))}</span>
        </span>
      ) : <span className="team-fixture-spacer" aria-hidden="true" />}
    </li>
  );
}

function Side({ name, badge, own }: { name: string; badge: string | null; own: boolean }) {
  return (
    <span className={own ? "team-fixture-side is-own" : "team-fixture-side"}>
      <span className="team-crest">
        <BadgeImage media={{ name, badge: badge ?? "" }} />
      </span>
      <span className="team-fixture-name">{name}</span>
    </span>
  );
}

function kickoffTime(match: ClubMatchView): string | null {
  if (!match.kickoff) return null;
  const parsed = new Date(match.kickoff);
  if (!Number.isFinite(parsed.getTime())) return null;
  // Midnight UTC is how a date-only kickoff arrives; it is not a published time.
  if (parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0) return null;
  return dateFormatter({ hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
    .format(parsed);
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
