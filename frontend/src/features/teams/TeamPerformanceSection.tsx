import { Link } from "react-router-dom";
import { t, useTranslation } from "../../i18n";
import { BadgeImage } from "../../components/BadgeImage";
import type { ClubDossierDto } from "../../api/schemas";
import {
  competitionLabel,
  competitionName,
  kickoffTime,
  matchDate,
  matchWindow,
  nextMatchId,
  resultWord,
  scoreText,
  signedDifference,
  summarize,
  withClubNames,
  type ClubMatchView,
  type NamedClub,
} from "./teamPerformance";
import type { TeamCompetition, TeamWindow } from "./teamRoutes";
import { TeamAbout } from "./TeamSummary";

import laliga from "../../assets/competitions/laliga.png";
import copa from "../../assets/competitions/copa-del-rey.png";
import uefa from "../../assets/competitions/uefa.svg";
import fifa from "../../assets/competitions/fifa.png";

/** Competition logos; friendlies and the rest are "other competitions", marked with FIFA. */
const FILTER_LOGOS: Record<TeamCompetition, string> = {
  laliga, european: uefa, domestic: copa, friendly: fifa, all: fifa,
};

const FILTERS: TeamCompetition[] = ["laliga", "european", "domestic", "friendly"];
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
  const nextId = nextMatchId(view.upcoming, performance?.nextMatchId);
  const label = competitionLabel(competition);
  const showBoard = performance != null && view.filtered.length > 0;
  const results = [...view.previous].reverse().filter((match) => match.outcome != null);
  return (
    <section
      id="team-performance"
      tabIndex={-1}
      aria-labelledby="team-performance-title"
    >
      <h2 id="team-performance-title" className="team-section-title">{t("Performance")}</h2>
      {showBoard ? (
        <TeamAbout
          items={[
            { id: "team-summary-overview", widget: "overview", label: t("Overview") },
            ...(view.previous.length > 0
              ? [{ id: "team-summary-previous", widget: "previous" as const, label: t("Previous matches") }]
              : []),
            ...(view.upcoming.length > 0
              ? [{ id: "team-summary-upcoming", widget: "upcoming" as const, label: t("Upcoming matches") }]
              : []),
          ]}
        />
      ) : null}
      <div className="team-controls">
        <div className="team-control">
          <span className="team-control-label" id="team-competition-label">{t("Competition")}</span>
          <div className="team-filter" role="group" aria-labelledby="team-competition-label">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={competition === item}
                className="team-filter-logo"
                title={t(competitionLabel(item))}
                onClick={() => onCompetition(item)}
              >
                <img src={FILTER_LOGOS[item]} alt="" />
                <span>{t(competitionLabel(item))}</span>
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
          <div className={window === "5" ? "team-performance-board" : "team-performance-board is-long"}>
            <ResultSummary summary={summary} results={results} />
            <MatchList
              id="previous"
              title={t("Previous matches")}
              matches={view.previous}
              nextId={null}
              clubs={clubs}
              showCompetition={competition !== "laliga"}
            />
            <MatchList
              id="upcoming"
              title={t("Upcoming matches")}
              matches={view.upcoming}
              nextId={nextId}
              clubs={clubs}
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
  const signed = signedDifference(difference);
  const tone = difference > 0 ? "positive" : difference < 0 ? "negative" : "even";
  return (
    <div className="team-match-group team-overview">
      <h3 id="team-overview-title">{t("Overview")}</h3>
      <div
        className="team-record"
        role="group"
        aria-labelledby="team-overview-title"
        aria-describedby="team-summary-overview"
      >
        <section className="team-record-group" aria-labelledby="team-record-results">
          <h4 id="team-record-results" className="team-record-title">{t("Results")}</h4>
          <dl className="team-record-primary">
            <div><dd>{summary.won}</dd><dt>{t("Win")}</dt></div>
            <div><dd>{summary.drawn}</dd><dt>{t("Draw")}</dt></div>
            <div><dd>{summary.lost}</dd><dt>{t("Loss")}</dt></div>
          </dl>
        </section>
        {results.length > 0 ? (
          <section className="team-record-group" aria-labelledby="team-record-form">
            <h4 id="team-record-form" className="team-record-title">{t("Recent form")}</h4>
            <ol className="team-form" aria-label={t("Recent results, oldest to newest")}>
              {results.map((match) => (
                <li key={match.matchId} className={`team-result team-result--${match.outcome}`}>
                  <span aria-hidden="true">{resultLetter(match.outcome)}</span>
                  <span className="visually-hidden">{t(resultWord(match.outcome))}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <section className="team-record-group" aria-labelledby="team-record-venue">
          <h4 id="team-record-venue" className="team-record-title">{t("Home and away")}</h4>
          <dl className="team-record-facts">
            <div>
              <dt>{t("Home")}</dt>
              <dd>{summary.home.won}-{summary.home.drawn}-{summary.home.lost}</dd>
            </div>
            <div>
              <dt>{t("Away")}</dt>
              <dd>{summary.away.won}-{summary.away.drawn}-{summary.away.lost}</dd>
            </div>
          </dl>
          <p className="team-record-hint">{t("Wins-draws-losses")}</p>
        </section>
        <section className="team-record-group" aria-labelledby="team-record-goals">
          <h4 id="team-record-goals" className="team-record-title">{t("Goals")}</h4>
          <dl className="team-record-facts team-record-goals">
            <div><dt>{t("Goals scored")}</dt><dd>{summary.goalsFor}</dd></div>
            <div><dt>{t("Goals conceded")}</dt><dd>{summary.goalsAgainst}</dd></div>
            <div><dt>{t("Goals difference")}</dt><dd data-tone={tone}>{signed}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function resultLetter(outcome: ClubMatchView["outcome"]): string {
  return t(resultWord(outcome)).charAt(0).toUpperCase();
}

function MatchList({
  id, title, matches, nextId, clubs, showCompetition,
}: {
  id: "previous" | "upcoming";
  title: string;
  matches: ClubMatchView[];
  nextId: string | null;
  clubs: readonly NamedClub[];
  showCompetition: boolean;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="team-match-group">
      <h3 id={`team-${id}-title`}>{title}</h3>
      <ul
        className="team-fixtures"
        aria-labelledby={`team-${id}-title`}
        aria-describedby={`team-summary-${id}`}
      >
        {matches.map((match) => (
          <MatchRow
            key={match.matchId}
            match={match}
            next={match.matchId === nextId}
            clubs={clubs}
            showCompetition={showCompetition}
          />
        ))}
      </ul>
    </div>
  );
}

function MatchRow({
  match, next, clubs, showCompetition,
}: {
  match: ClubMatchView;
  next: boolean;
  clubs: readonly NamedClub[];
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
        <Side name={match.home} badge={match.homeBadge} own={own === "home"} clubId={clubIdFor(match.home, clubs)} />
        <span className="team-fixture-score">{score ?? time ?? t("vs")}</span>
        <Side name={match.away} badge={match.awayBadge} own={own === "away"} clubId={clubIdFor(match.away, clubs)} />
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

/** The club a fixture side names, matched on its name without case or accents. */
function clubIdFor(name: string, clubs: readonly NamedClub[]): number | null {
  const key = plain(name);
  return clubs.find((club) => plain(club.name) === key)?.clubId ?? null;
}

function plain(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function Side({ name, badge, own, clubId }: {
  name: string; badge: string | null; own: boolean; clubId: number | null;
}) {
  const content = (
    <>
      <span className="team-crest">
        <BadgeImage media={{ name, badge: badge ?? "" }} />
      </span>
      <span className="team-fixture-name">{name}</span>
    </>
  );
  // The club being viewed needs no link to itself; every other side opens that club's page.
  if (own || clubId == null) {
    return <span className={own ? "team-fixture-side is-own" : "team-fixture-side"}>{content}</span>;
  }
  return <Link className="team-fixture-side is-link" to={`/teams/${clubId}`}>{content}</Link>;
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
