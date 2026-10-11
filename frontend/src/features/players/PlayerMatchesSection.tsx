import { useState } from "react";
import { asFiniteNumber, asRecord, text } from "../../api/mappers";
import footballIcon from "../../assets/boxicons_football-filled.svg";
import { windKmhFromMs } from "./playerDetailFormat";
import { useNow } from "../../hooks/useNow";
import {
  fixtureDate,
  matchOutcome,
  sortMatchesByDate,
  teamMediaFromFixture,
  weatherConditionFromSnapshot,
  type MatchOutcome,
  type WeatherCondition,
} from "./playerDetailWidgets";
import "./playerDetailWidgets.css";

const WEATHER_ICONS = import.meta.glob<string>(
  "../../assets/weather/icon_weather_*_*.svg",
  { eager: true, query: "?url", import: "default" },
);

const WEATHER_CONDITIONS: Record<WeatherCondition, string> = {
  clear: "Clear",
  few_clouds: "Few clouds",
  scattered_clouds: "Scattered clouds",
  broken_clouds: "Broken clouds",
  overcast: "Overcast",
  drizzle: "Drizzle",
  rain: "Rain",
  shower_rain: "Showers",
  thunderstorm: "Thunderstorm",
  snow: "Snow",
  mist: "Mist",
};

function weatherIcon(condition: WeatherCondition | null): string {
  if (!condition) return "";
  return WEATHER_ICONS[`../../assets/weather/icon_weather_${condition}_white.svg`] ?? "";
}

function weatherReason(value: unknown): string {
  switch (text(value)) {
    case "beyond_forecast_horizon":
      return "Outside the forecast window";
    case "venue_unknown":
      return "Stadium weather unavailable";
    case "kickoff_unknown":
      return "Kickoff time not confirmed";
    case "disabled":
      return "Weather forecast disabled";
    case "provider_unavailable":
      return "Forecast unavailable";
    default:
      return "Weather unavailable";
  }
}

function competitionHeading(fixture: Record<string, unknown> | null): string {
  const raw = text(fixture?.competition_label) ?? text(fixture?.competition) ?? "";
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

  if (!competition) return "OTHERS";
  const matchweek = asFiniteNumber(fixture?.matchweek);
  return `${matchweek != null ? `F${matchweek}` : "F–"} · ${competition}`;
}

function MatchWeather({ match }: { match: Record<string, unknown> | null }) {
  const weather = asRecord(match?.weather);
  const snapshot = asRecord(weather?.snapshot);
  const condition = weatherConditionFromSnapshot(snapshot);
  const temperature = asFiniteNumber(snapshot?.temperature_c);
  const feelsLike = asFiniteNumber(snapshot?.feels_like_c);
  const humidity = asFiniteNumber(snapshot?.humidity_pct);
  const wind = windKmhFromMs(asFiniteNumber(snapshot?.wind_speed_ms));

  return (
    <div className="player-match-weather">
      <h4>Weather</h4>
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
            {condition ? WEATHER_CONDITIONS[condition] : "Condition unavailable"}
          </p>
          <ul className="player-match-weather-metrics">
            <li>
              Temperature: {temperature != null ? `${temperature}°C` : "–"}
              {feelsLike != null ? ` (${feelsLike}°C)` : ""}
            </li>
            <li>Humidity: {humidity != null ? `${humidity}%` : "–"}</li>
            <li>Wind: {wind != null ? `${wind} km/h` : "–"}</li>
          </ul>
        </>
      ) : (
        <p className="player-match-weather-unavailable">{weatherReason(weather?.reason)}</p>
      )}
    </div>
  );
}

function outcomeLabel(outcome: MatchOutcome): string {
  switch (outcome) {
    case "win":
      return "Won";
    case "loss":
      return "Lost";
    case "draw":
      return "Draw";
    default:
      return "Score unavailable";
  }
}

function TeamCrest({ media }: { media: { badge: string } | null }) {
  const [failed, setFailed] = useState(false);
  if (!media || failed) return <span aria-hidden="true">–</span>;
  return (
    <img
      src={media.badge}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function MatchTimer({ kickoff }: { kickoff: string | null }) {
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
      <summary>View match timer</summary>
      <p>
        <span>Time remaining</span>
        <strong>{countdown}</strong>
      </p>
    </details>
  );
}

function MatchCard({
  match,
  upcoming,
}: {
  match: unknown;
  upcoming: boolean;
}) {
  const matchRecord = asRecord(match);
  const fixture = asRecord(matchRecord?.fixture) ?? matchRecord;
  const home = teamMediaFromFixture(fixture?.home_team);
  const away = teamMediaFromFixture(fixture?.away_team);
  const homeScore = asFiniteNumber(fixture?.home_score);
  const awayScore = asFiniteNumber(fixture?.away_score);
  const homeOutcome = matchOutcome(homeScore, awayScore);
  const awayOutcome = matchOutcome(awayScore, homeScore);
  const competition = competitionHeading(fixture);
  const matchDate = text(fixture?.date) ?? text(matchRecord?.kickoff);
  const kickoff =
    text(matchRecord?.kickoff) ?? text(fixture?.kickoff) ?? text(fixture?.date);
  const date = fixtureDate(matchDate);
  const points = asFiniteNumber(matchRecord?.fantasy_points_total);
  const minutes = asFiniteNumber(asRecord(matchRecord?.minutes)?.minutes) ??
    asFiniteNumber(matchRecord?.minutes_played);

  return (
    <li className={`player-match-card${upcoming ? " is-upcoming" : ""}`}>
      <p className="player-match-competition">
        {competition}
      </p>
      <div className="player-match-teams">
        <div className="player-match-team">
          <div className="player-match-crest-tile">
            <TeamCrest key={home?.badge ?? "home"} media={home} />
            {homeScore != null ? (
              <span className={`player-match-score is-${homeOutcome}`}>
                <span className="visually-hidden">{outcomeLabel(homeOutcome)}: </span>
                {homeScore}
              </span>
            ) : null}
          </div>
          <span className="player-match-team-name">{home?.name ?? text(fixture?.home_team) ?? "Home"}</span>
        </div>
        <div className="player-match-team">
          <div className="player-match-crest-tile">
            <TeamCrest key={away?.badge ?? "away"} media={away} />
            {awayScore != null ? (
              <span className={`player-match-score is-${awayOutcome}`}>
                <span className="visually-hidden">{outcomeLabel(awayOutcome)}: </span>
                {awayScore}
              </span>
            ) : null}
          </div>
          <span className="player-match-team-name">{away?.name ?? text(fixture?.away_team) ?? "Away"}</span>
        </div>
      </div>
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
          {minutes != null ? `${minutes} min` : ""}
          {minutes != null && points != null ? " · " : ""}
          {points != null ? `${points} Fantasy points` : ""}
        </p>
      ) : null}
    </li>
  );
}

function MatchGroup({
  title,
  matches,
  upcoming,
}: {
  title: string;
  matches: unknown[];
  upcoming: boolean;
}) {
  return (
    <div className={`player-match-group${upcoming ? " is-upcoming" : ""}`}>
      <h3>
        <img src={footballIcon} alt="" aria-hidden="true" />
        {title}
      </h3>
      {matches.length === 0 ? (
        <p className="player-match-empty">No {upcoming ? "upcoming" : "recent"} matches available.</p>
      ) : (
        <ul className="player-match-grid">
          {matches.slice(0, 5).map((match, index) => {
            const fixture = asRecord(asRecord(match)?.fixture);
            const key = [fixture?.date, fixture?.home_team, fixture?.away_team, index]
              .map((part) => String(part ?? ""))
              .join("|");
            return <MatchCard key={key} match={match} upcoming={upcoming} />;
          })}
        </ul>
      )}
    </div>
  );
}

export function PlayerMatchesSection({
  recent,
  upcoming,
}: {
  recent: Record<string, unknown> | null;
  upcoming: Record<string, unknown> | null;
}) {
  const recentMatches = Array.isArray(recent?.matches)
    ? sortMatchesByDate(recent.matches, "desc")
    : [];
  const upcomingMatches = Array.isArray(upcoming?.matches)
    ? sortMatchesByDate(upcoming.matches, "asc")
    : [];

  return (
    <section className="player-detail-panel player-match-section" aria-labelledby="player-matches-title">
      <h2 id="player-matches-title">Previous &amp; Upcoming matches</h2>
      <MatchGroup title="Previous 5 matches" matches={recentMatches} upcoming={false} />
      <MatchGroup title="Upcoming 5 matches" matches={upcomingMatches} upcoming />
    </section>
  );
}
