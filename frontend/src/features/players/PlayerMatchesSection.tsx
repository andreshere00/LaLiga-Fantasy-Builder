import { asFiniteNumber, asRecord, text } from "../../api/mappers";
import footballIcon from "../../assets/boxicons_football-filled.svg";
import { windKmhFromMs } from "./playerDetailFormat";
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
  const matchweek = asFiniteNumber(fixture?.matchweek);
  const competition =
    text(fixture?.competition_label) ?? text(fixture?.competition) ?? "Competition";
  const matchDate = text(fixture?.date) ?? text(matchRecord?.kickoff);
  const date = fixtureDate(matchDate);
  const points = asFiniteNumber(matchRecord?.fantasy_points_total);
  const minutes = asFiniteNumber(asRecord(matchRecord?.minutes)?.minutes) ??
    asFiniteNumber(matchRecord?.minutes_played);

  return (
    <li className={`player-match-card${upcoming ? " is-upcoming" : ""}`}>
      <p className="player-match-competition">
        {matchweek != null ? `F${matchweek}` : "F–"} · {competition}
      </p>
      <div className="player-match-teams">
        <div className="player-match-team">
          <div className="player-match-crest-tile">
            {home ? <img src={home.badge} alt="" aria-hidden="true" /> : <span>–</span>}
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
            {away ? <img src={away.badge} alt="" aria-hidden="true" /> : <span>–</span>}
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
        <MatchWeather match={matchRecord} />
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
