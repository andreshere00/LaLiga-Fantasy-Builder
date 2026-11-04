import { numberFormatter } from "../../i18n/format";
import { t, useTranslation } from "../../i18n";
import { BadgeImage } from "../../components/BadgeImage";
import { fixtureClubMedia, competitionMedia } from "../../api/clubMedia";
import { WEATHER_CONDITIONS, weatherIcon, weatherReason } from "../../components/weather";
import { asFiniteNumber, asRecord, text } from "../../api/mappers";
import footballIcon from "../../assets/boxicons_football-filled.svg";
import { windKmhFromMs } from "./playerDetailFormat";
import { useNow } from "../../hooks/useNow";
import {
  fixtureDate,
  matchOutcomeForTeam,
  sortMatchesByDate,
  weatherConditionFromSnapshot,
} from "./playerDetailWidgets";
import "./playerDetailWidgets.css";

function competitionHeading(fixture: Record<string, unknown> | null): string {
  const raw = text(fixture?.competitionLabel) ?? text(fixture?.competition) ?? "";
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  let competition: string | null = null;

  if (normalized.includes("CHAMPIONS") || normalized === "UCL") competition = "CHAMPIONS";
  else if (normalized.includes("CONFERENCE") || normalized === "UECL") competition = "CONFERENCE";
  else if (normalized.includes("EUROPA") || normalized === "UEL") competition = "EUROPA";
  else if (normalized.includes("SUPERCOPA")) competition = "SUPERCOPA";
  else if (normalized.includes("COPA DEL REY") || normalized === "COPA") competition = "COPA";
  else if (
    normalized === "LEAGUE" ||
    normalized.includes("LALIGA") ||
    normalized.includes("LA LIGA") ||
    normalized.includes("PRIMERA DIVISION")
  ) competition = "LEAGUE";

  if (!competition) return t("Other competitions");
  const matchweek = asFiniteNumber(fixture?.matchweek);
  const labels: Record<string, string> = { LEAGUE: "LALIGA", CHAMPIONS: "UEFA Champions League", CONFERENCE: "UEFA Conference League", EUROPA: "UEFA Europa League", SUPERCOPA: "Supercopa de España", COPA: "Copa del Rey" };
  return `${t("Matchweek {{0}}", { 0: matchweek ?? "–" })} · ${labels[competition]}`;
}

function MatchWeather({ match }: { match: Record<string, unknown> | null }) {
  useTranslation();
  const weather = asRecord(match?.weather);
  const snapshot = asRecord(weather?.snapshot);
  const condition = weatherConditionFromSnapshot(snapshot);
  const temperature = asFiniteNumber(snapshot?.temperatureC);
  const feelsLike = asFiniteNumber(snapshot?.feelsLikeC);
  const humidity = asFiniteNumber(snapshot?.humidityPct);
  const wind = windKmhFromMs(asFiniteNumber(snapshot?.windSpeedMs));

  return (
    <div className="player-match-weather">
      <h4>{t("Forecast")}</h4>
      {snapshot ? (
        <>
          {condition ? (
            <span className="player-match-weather-icon">
              <img src={weatherIcon(condition)} alt="" aria-hidden="true" />
            </span>
          ) : (
            <span className="player-match-weather-icon is-unavailable" aria-hidden="true">
              ?
            </span>
          )}
          <p className="player-match-weather-condition">
            {condition ? t(WEATHER_CONDITIONS[condition]) : t("Condition unavailable")}
          </p>
          <ul className="player-match-weather-metrics">
            <li>
              {t("Temperature: ")}{temperature != null ? t("{{0}}°C", { 0: numberFormatter({ maximumFractionDigits: 20 }).format(temperature) }) : "–"}
              {feelsLike != null ? t(" ({{0}}°C)", { 0: numberFormatter({ maximumFractionDigits: 20 }).format(feelsLike) }) : ""}
            </li>
            <li>{t("Humidity: ")}{humidity != null ? `${numberFormatter({ maximumFractionDigits: 20 }).format(humidity)}%` : "–"}</li>
            <li>{t("Wind: ")}{wind != null ? t("{{0}} km/h", { 0: numberFormatter({ maximumFractionDigits: 20 }).format(wind) }) : "–"}</li>
          </ul>
        </>
      ) : (
        <p className="player-match-weather-unavailable">{t(weatherReason(weather?.reason))}</p>
      )}
    </div>
  );
}


function MatchTimer({ kickoff }: { kickoff: string | null }) {
  useTranslation();
  const now = useNow();
  const kickoffMs = kickoff ? Date.parse(kickoff) : NaN;
  const remaining = kickoffMs - now;
  let countdown = "Kickoff time not confirmed";
  if (kickoff && /T\d{2}:\d{2}/.test(kickoff) && Number.isFinite(kickoffMs)) {
    if (remaining <= 0) {
      countdown = "Kickoff has passed";
    } else {
      const minutes = Math.floor(remaining / 60_000);
      const days = Math.floor(minutes / 1_440);
      const hours = Math.floor((minutes % 1_440) / 60);
      const restMinutes = minutes % 60;
      countdown = [
        days ? `${days}d` : null,
        hours || days ? `${hours}h` : null,
        `${restMinutes}m`,
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  return (
    <details className="player-match-timer">
      <summary>{t("View match timer")}</summary>
      <p>
        <span>{t("Time remaining")}</span>
        <strong>{countdown}</strong>
      </p>
    </details>
  );
}

function MatchCard({
  match,
  upcoming,
  playerTeamName,
}: {
  match: unknown;
  upcoming: boolean;
  playerTeamName: string | null;
}) {
  useTranslation();
  const matchRecord = asRecord(match);
  const fixture = asRecord(matchRecord?.fixture) ?? matchRecord;
  const home = fixtureClubMedia(fixture, "home");
  const away = fixtureClubMedia(fixture, "away");
  const homeScore = asFiniteNumber(fixture?.homeScore);
  const awayScore = asFiniteNumber(fixture?.awayScore);
  const teamOutcome = matchOutcomeForTeam(
    homeScore,
    awayScore,
    playerTeamName,
    home?.name ?? text(fixture?.homeTeam),
    away?.name ?? text(fixture?.awayTeam),
  );

  const competition = competitionHeading(fixture);
  const matchDate = text(fixture?.date) ?? text(matchRecord?.kickoff);
  const kickoff =
    text(matchRecord?.kickoff) ?? text(fixture?.kickoff) ?? text(fixture?.date);
  const date = fixtureDate(matchDate);
  const points = asFiniteNumber(matchRecord?.fantasyPointsTotal);
  const minutes = asFiniteNumber(asRecord(matchRecord?.minutes)?.minutes) ??
    asFiniteNumber(matchRecord?.minutesPlayed);

  return (
    <li className={`player-match-card is-${upcoming ? "upcoming" : teamOutcome}`}>
      <p className="player-match-competition">
        <span className="player-match-competition-badge"><BadgeImage media={competitionMedia(fixture)} fallback="" /></span>
        {competition}
      </p>
      <div className="player-match-teams">
        <div className="player-match-team">
          <div className="player-match-crest-tile">
            <BadgeImage media={home} />
          </div>
          <span className="player-match-team-name">{home?.name ?? text(fixture?.homeTeam) ?? t("Home")}</span>
        </div>
        <div className="player-match-team">
          <div className="player-match-crest-tile">
            <BadgeImage media={away} />
          </div>
          <span className="player-match-team-name">{away?.name ?? text(fixture?.awayTeam) ?? t("Away")}</span>
        </div>
      </div>
      {!upcoming ? <p className="player-match-result">
        <strong>{(homeScore ?? t("—"))} – {(awayScore ?? t("—"))}</strong>
        {fixture?.result ? <span>{fixture.result === "W" ? t("Won") : fixture.result === "L" ? t("Lost") : t("Draw")}</span> : null}
      </p> : null}
      <time className="player-match-date" dateTime={matchDate ?? undefined}>
        {date}
      </time>
      {upcoming ? (
        <>
          <MatchTimer kickoff={kickoff} />
          <MatchWeather match={matchRecord} />
        </>
      ) : points != null || minutes != null ? (
        <p className="player-match-player-stats">
          {minutes != null ? t("{{0}} min", { 0: minutes }) : ""}
          {minutes != null && points != null ? " · " : ""}
          {points != null ? t("{{0}} Fantasy points", { 0: points }) : ""}
        </p>
      ) : null}
    </li>
  );
}

function MatchGroup({
  title,
  matches,
  upcoming,
  playerTeamName,
  unavailable = false,
}: {
  title: string;
  matches: unknown[];
  upcoming: boolean;
  playerTeamName: string | null;
  unavailable?: boolean;
}) {
  useTranslation();
  return (
    <div className={`player-match-group${upcoming ? " is-upcoming" : ""}`}>
      <h3>
        <img src={footballIcon} alt="" aria-hidden="true" />
        {title}
      </h3>
      {unavailable ? (
        <p className="player-match-empty">{upcoming ? t("Upcoming matches are temporarily unavailable.") : t("Recent matches are temporarily unavailable.")}</p>
      ) : matches.length === 0 ? (
        <p className="player-match-empty">{upcoming ? t("No upcoming matches available.") : t("No recent matches available.")}</p>
      ) : (
        <ul className="player-match-grid">
          {matches.slice(0, 5).map((match, index) => {
            const fixture = asRecord(asRecord(match)?.fixture);
            const key = [fixture?.date, fixture?.homeTeam, fixture?.awayTeam, index]
              .map((part) => String(part ?? ""))
              .join("|");
            return (
              <MatchCard
                key={key}
                match={match}
                upcoming={upcoming}
                playerTeamName={playerTeamName}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PlayerMatchesSection({
  recent,
  upcoming,
  playerTeamName,
}: {
  recent: Record<string, unknown> | null;
  upcoming: Record<string, unknown> | null;
  playerTeamName: string | null;
}) {
  useTranslation();
  const recentMatches = Array.isArray(recent?.matches)
    ? sortMatchesByDate(recent.matches, "desc")
    : [];
  const upcomingMatches = Array.isArray(upcoming?.matches)
    ? sortMatchesByDate(upcoming.matches, "asc")
    : [];

  return (
    <section className="player-detail-panel player-match-section" aria-labelledby="player-matches-title">
      <h2 className="player-section-title" id="player-matches-title" tabIndex={-1}>{t("Previous & Upcoming matches")}</h2>
      <MatchGroup
        title={t("Previous 5 matches")}
        matches={recentMatches}
        upcoming={false}
        playerTeamName={playerTeamName}
        unavailable={recent == null}
      />
      <MatchGroup
        title={t("Upcoming 5 matches")}
        matches={upcomingMatches}
        upcoming
        playerTeamName={playerTeamName}
        unavailable={upcoming == null}
      />
    </section>
  );
}
