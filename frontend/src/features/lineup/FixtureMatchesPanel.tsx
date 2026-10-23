import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { FixtureWeatherDto } from "../../api/schemas";
import { useAuth } from "../../auth/AuthProvider";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { PulseRing } from "../../components/ui/PulseRing";
import { ScrollArea } from "../../components/ui/ScrollArea";
import { WEATHER_CONDITIONS, weatherIcon, weatherReason } from "../../components/weather";
import { weatherConditionFromSnapshot } from "../players/playerDetailWidgets";
import { windKmhFromMs } from "../players/playerDetailFormat";
import { BadgeImage } from "../../components/BadgeImage";
import { clubMediaFromFixture } from "../../api/clubMedia";
import { FIXTURE_TIME_ZONE, weatherMatchesFixture, type PanelMatch } from "./fixturePanelModel";
import { useFixturePanel } from "./useFixturePanel";
import "./FixtureMatchesPanel.css";

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: FIXTURE_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: FIXTURE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const updatedFormat = new Intl.DateTimeFormat("en-GB", { timeZone: FIXTURE_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

function MatchForecast({ match, row, loading, failed, now }: {
  match: PanelMatch; row: FixtureWeatherDto | undefined; loading: boolean; failed: boolean; now: number;
}) {
  if (match.status === "finished") return null;
  const snapshot = row?.weather.snapshot;
  const updateFailed = failed || row?.weather.reason === "provider_unavailable";
  const past = match.kickoffMs != null && match.kickoffMs <= now;
  const condition = weatherConditionFromSnapshot(snapshot ?? null);
  const wind = windKmhFromMs(snapshot?.windSpeedMs);
  const probability = snapshot?.precipitationProbability;
  const rain = probability != null && probability >= 0 && probability <= 1 ? Math.round(probability * 100) : null;
  const message = loading && !row ? "Loading forecast…" : row?.weather.reason === "beyond_forecast_horizon"
    ? "Forecast closer to kickoff" : past && !snapshot ? "Kickoff forecast unavailable"
      : failed && !row ? "Forecast unavailable" : weatherReason(row?.weather.reason);
  if (!snapshot) return <div className="fixture-match-weather"><p className="fixture-weather-meta">{message}</p></div>;
  return (
    <details className="fixture-match-weather">
      <summary className="fixture-weather-summary">
        {condition ? <span className="fixture-weather-icon" aria-hidden="true"
          style={{ "--weather-icon": `url("${weatherIcon(condition)}")` } as CSSProperties} /> : null}
        <span>Forecast {Math.round(snapshot.temperatureC)}°C · {condition ? WEATHER_CONDITIONS[condition] : "Condition unavailable"}</span>
        <span className="fixture-weather-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="fixture-forecast-content" role="region" aria-label={`Forecast for ${match.home.name} vs ${match.away.name}`}>
        <p className="fixture-weather-meta">Rain {rain == null ? "—" : `${rain}%`} · Wind {wind == null ? "—" : `${wind} km/h`}</p>
        {past ? <p className="fixture-weather-meta">Saved kickoff forecast</p> : null}
        {row?.fetchedAt ? <p className="fixture-weather-meta">
          {updateFailed ? "Update unavailable · " : "Retrieved "}
          <time dateTime={row.fetchedAt}>{updatedFormat.format(new Date(row.fetchedAt))}</time>
        </p> : null}
      </div>
    </details>
  );
}

function FixtureMatch({ match, forecast, weatherLoading, weatherFailed, now }: {
  match: PanelMatch; forecast: FixtureWeatherDto | undefined; weatherLoading: boolean; weatherFailed: boolean; now: number;
}) {
  const status = match.status === "finished" ? "Finished" : match.status === "unconfirmed"
    ? "Status unconfirmed" : match.kickoffMs != null ? timeFormat.format(match.kickoffMs) : "Time TBC";
  return (
    <li className={`fixture-match${match.status === "unconfirmed" ? " is-updating" : ""}`}>
      <div className="fixture-match-date">
        {match.kickoff ? <time dateTime={match.kickoff}>{dayFormat.format(new Date(match.kickoff))}</time> : <span>Date TBC</span>}
        <span>{status}</span>
      </div>
      {([match.home, match.away] as const).map((team, index) => (
        <div className="fixture-match-team" key={index}>
          <span className="fixture-match-crest" aria-hidden="true"><BadgeImage media={clubMediaFromFixture(team)} fallback="—" /></span>
          <span>{team.name}</span>
          <span className="fixture-match-score" aria-label={`${index === 0 ? "Home" : "Away"} goals: ${(index === 0 ? match.homeScore : match.awayScore) ?? "no result"}`}>
            {(index === 0 ? match.homeScore : match.awayScore) ?? "—"}
          </span>
        </div>
      ))}
      <MatchForecast match={match} row={forecast} loading={weatherLoading} failed={weatherFailed} now={now} />
    </li>
  );
}

/** Reset panel-owned view state when the authenticated account changes. */
export function FixtureMatchesPanel() {
  const { user } = useAuth();
  return <FixtureMatchesPanelContent key={user?.userId ?? "signed-out"} />;
}

function FixtureMatchesPanelContent() {
  const panel = useFixturePanel();
  const heading = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounced = useRef<{ week: number | undefined; label: string; scores: Map<string, string> } | null>(null);
  const week = panel.selection?.week;
  const matches = panel.round?.matches ?? [];
  const hasMatches = matches.length > 0;
  useEffect(() => {
    const node = viewport.current;
    if (!node || !hasMatches) return;
    node.scrollLeft = 0;
    const updating = node.querySelector<HTMLElement>(".is-updating");
    if (updating) node.scrollLeft = updating.getBoundingClientRect().left - node.getBoundingClientRect().left - 12;
  }, [week, hasMatches]);
  const mode = panel.selection?.mode;
  const label = mode === "active" ? "In progress" : mode === "season-complete" ? "Season complete"
    : mode === "finished" ? "Finished" : mode === "upcoming" ? "Up next" : "Awaiting updates";
  const weatherRows = panel.weather.data?.matches ?? [];
  const reportedScores = JSON.stringify(matches.map((match) => ({
    key: match.key, text: `${match.home.name} ${match.homeScore ?? "—"}, ${match.away.name} ${match.awayScore ?? "—"}`,
  })));
  useEffect(() => {
    const scores = new Map<string, string>((JSON.parse(reportedScores) as { key: string; text: string }[]).map((row) => [row.key, row.text]));
    const old = lastAnnounced.current;
    if (week != null && (!old || old.week !== week || old.label !== label)) {
      setAnnouncement(`Fixture ${week}. ${label}.`);
    } else if (old) {
      const changed = [...scores].filter(([key, text]) => old.scores.has(key) && old.scores.get(key) !== text);
      if (changed.length > 0) setAnnouncement(changed.length > 3 ? `${changed.length} match results updated.` : changed.map(([, text]) => text).join(". "));
    }
    lastAnnounced.current = { week, label, scores };
  }, [week, label, reportedScores]);
  return (
    <Card className="fixture-matches-panel" role="region" aria-labelledby={heading}>
      <CardHeader>
        <div className="fixture-panel-heading">
          <div>
            <div className="fixture-panel-title"><CardTitle id={heading}>LALIGA{week ? ` · Fixture ${week}` : " matches"}</CardTitle>
              <Badge className={mode === "active" ? "fixture-panel-active" : ""}>{label}</Badge>
            </div>
            <p className="fixture-panel-meta">
              {mode === "active" ? `${matches.filter((match) => match.status === "finished").length} of 10 matches finished` : `${matches.length} matches`} · {FIXTURE_TIME_ZONE}
            </p>
          </div>
          <nav className="fixture-week-pagination" aria-label="Fixture navigation">
            <Button variant="outline" shape="square" size="icon" aria-label="Previous matchweek"
              disabled={week == null || week <= 1} onClick={() => panel.navigate(-1)}>‹</Button>
            <span className="fixture-week-label">Fixture {week ?? "—"}</span>
            <Button variant="outline" shape="square" size="icon" aria-label="Next matchweek"
              disabled={week == null || week >= 38} onClick={() => panel.navigate(1)}>›</Button>
          </nav>
        </div>
        {panel.error ? <p className="fixture-panel-error" role="alert">
          {panel.stale ? "Update unavailable. Showing previously retrieved matches." : "Fixture matches unavailable."}
          {!hasMatches ? <Button variant="ghost" size="sm" shape="square" onClick={() => void panel.refresh()}>Retry fixture matches</Button> : null}
        </p> : null}
        {panel.pendingNext ? <p className="fixture-panel-meta" role="status">
          {panel.nextUnavailable ? <>Next fixture unavailable. Retrying automatically. <Button variant="ghost" size="sm" shape="square" onClick={() => void panel.refresh()}>Retry fixture matches</Button></> : "Loading next fixture…"}
        </p> : null}
        {hasMatches && !panel.round?.consistent ? <p className="fixture-panel-meta">Round data incomplete. Awaiting verified final results.</p> : null}
      </CardHeader>
      <CardContent>
        {hasMatches ? <ScrollArea horizontal className="fixture-matches-scroll" viewportProps={{
          ref: viewport, role: "region", "aria-label": "Fixture matches",
          onKeyDown: (event) => {
            if (event.target !== event.currentTarget || !["Home", "End"].includes(event.key)) return;
            event.preventDefault();
            event.currentTarget.scrollTo({ left: event.key === "Home" ? 0 : event.currentTarget.scrollWidth });
          },
        }}>
          <ol className="fixture-matches-list">
            {matches.map((match) => <FixtureMatch key={match.key} match={match} now={panel.now}
              forecast={weatherRows.find((row) => weatherMatchesFixture(row, match))}
              weatherLoading={panel.weather.isFetching} weatherFailed={panel.weather.isError} />)}
          </ol>
        </ScrollArea> : panel.loading ? <PulseRing label="Loading fixture matches…" /> : !panel.error ?
          <p className="fixture-panel-empty">{mode === "unavailable" ? "Fixture status unavailable." : "No matches available for this fixture."}</p> : null}
      </CardContent>
      <div className="fixture-panel-footer">
        <span>{panel.updatedAt > 0 ? <>Matches retrieved <time dateTime={new Date(panel.updatedAt).toISOString()}>{updatedFormat.format(panel.updatedAt)}</time></> : "Results refresh every 30 seconds"}</span>
        <span>Forecasts: <a href="https://openweathermap.org/" target="_blank" rel="noreferrer">OpenWeather</a> · Kickoff forecast</span>
      </div>
      <p className="fixture-panel-sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </Card>
  );
}
