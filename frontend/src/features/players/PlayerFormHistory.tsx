import { numberFormatter, dateFormatter } from "../../i18n/format";
import { copy as localizeCopy, useLanguage } from "../../i18n";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { asFiniteNumber, asRecord, text } from "../../api/mappers";
import { fixtureClubMedia, type ClubMedia } from "../../api/clubMedia";
import { BadgeImage } from "../../components/BadgeImage";
import { Button } from "../../components/ui/Button";
import { clubDisplayName } from "./clubNames";
import { fixtureDateLabel, MISSING_STAT, statDisplay } from "./playerDetailFormat";
import daznIcon from "../../assets/dazn.png";
import "./PlayerFormHistory.css";

const STAT_SPECS = [
  ["minutesPlayed", "Minutes"], ["goals", "Goals"], ["assists", "Assists"],
  ["bigChancesCreated", "Big chances"], ["ballsIntoBox", "Balls into box"],
  ["penaltiesWon", "Penalties won"], ["penaltiesCommitted", "Penalties committed"],
  ["penaltiesSaved", "Penalties saved"], ["saves", "Saves"], ["clearances", "Clearances"],
  ["penaltiesMissed", "Penalties missed"], ["ownGoals", "Own goals"],
  ["goalsConceded", "Goals conceded"], ["yellowCards", "Yellow cards"],
  ["redCard", "Red card"], ["shots", "Shots"], ["successfulDribbles", "Dribbles"],
  ["recoveries", "Recoveries"], ["ballsLost", "Balls lost"], ["daznPoints", "DAZN"],
] as const;

const numberFormat = numberFormatter({ maximumFractionDigits: 1 });
const dateFormat = dateFormatter({ day: "numeric", month: "short", timeZone: "UTC" });
const compactDateFormat = dateFormatter({ day: "2-digit", month: "2-digit", timeZone: "UTC" });

function formFixture(row: unknown, index: number) {
  const record = asRecord(row);
  const fixture = asRecord(record?.fixture);
  const date = text(fixture?.date);
  const home = clubDisplayName(text(fixture?.homeTeam));
  const away = clubDisplayName(text(fixture?.awayTeam));
  const opponent = clubDisplayName(text(fixture?.opponent));
  const label = home && away ? `${home} vs ${away}` : opponent ?? "Fixture";
  return {
    key: [date, home, away, opponent, fixture?.matchweek, index].join("|"),
    label, home, away,
    homeMedia: fixtureClubMedia(fixture, "home"),
    awayMedia: fixtureClubMedia(fixture, "away"),
    date,
    dateLabel: date && Number.isFinite(Date.parse(date))
      ? dateFormat.format(new Date(date)) : fixtureDateLabel(fixture),
    compactDateLabel: date && Number.isFinite(Date.parse(date))
      ? compactDateFormat.format(new Date(date)) : fixtureDateLabel(fixture),
    points: asFiniteNumber(record?.fantasyPointsTotal),
    minutes: asFiniteNumber(record?.minutesPlayed),
    stats: asRecord(record?.stats),
  };
}

function FormClubBadge({ media, name }: { media: ClubMedia | null; name: string | null }) {
  useLanguage();
  const initials = name?.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() ?? "?";
  return <span className="player-form-club-badge" title={name ?? "Club unavailable"}>
    <BadgeImage media={media} fallback={initials} />
  </span>;
}

/** A shared score scale with native radio selection for per-fixture details. */
export function PlayerFormHistory({ rows }: { rows: readonly unknown[] }) {
  useLanguage();
  const fixtures = rows.map(formFixture);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);
  const selected = fixtures.find((fixture) => fixture.key === selectedKey) ?? fixtures.at(-1);
  const radioName = useId();
  const detailsId = useId();
  const helpId = useId();
  const scrollArea = useRef<HTMLDivElement>(null);
  const selectedColumn = useRef<HTMLLabelElement>(null);

  // Reveal the latest/keyboard-selected fixture without moving the page vertically.
  useLayoutEffect(() => {
    const area = scrollArea.current;
    const column = selectedColumn.current;
    if (!area || !column) return;
    const reveal = () => {
      const frame = area.getBoundingClientRect();
      const item = column.getBoundingClientRect();
      if (item.left < frame.left) area.scrollLeft -= frame.left - item.left + 3;
      else if (item.right > frame.right) area.scrollLeft += item.right - frame.right + 3;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(area);
    return () => observer.disconnect();
  }, [selected?.key]);

  if (!selected) return null;

  const known = fixtures.flatMap(({ points }) => points == null ? [] : [points]);
  const missing = fixtures.length - known.length;
  const total = known.reduce((sum, points) => sum + points, 0);
  const average = known.length > 0 ? total / known.length : null;
  const best = known.length > 0 ? Math.max(...known) : null;
  // Include zero and pad both ends for labels; negative scores extend below zero.
  const low = Math.min(0, ...known);
  const high = Math.max(0, ...known);
  const padding = Math.max(1, (high - low) * 0.18);
  const min = low < 0 ? low - padding : 0;
  const max = high + padding;
  const position = (value: number) => (max - value) / (max - min) * 100;
  const zero = position(0);
  const columnWidth = fixtures.length <= 5 ? 44 : 80;

  return (
    <div className="player-form-history">
      <div className="player-form-metrics" aria-label={localizeCopy("Shown fixture summary")}>
        <div className="player-form-total">
          <span>{localizeCopy(missing > 0 ? "Known fantasy points" : "Total fantasy points")}</span>
          <strong>{localizeCopy(known.length > 0 ? numberFormat.format(total) : "Unavailable")}</strong>
          {missing > 0 ? <small>{localizeCopy("Points unavailable for ")}{missing} {localizeCopy(" of ")}{fixtures.length} {localizeCopy(" fixtures.")}</small>
            : <small>{localizeCopy("Across ")}{fixtures.length} {localizeCopy(" fixtures")}</small>}
        </div>
        <div>
          <span>{localizeCopy(missing > 0 ? "Average · known scores" : "Average per fixture")}</span>
          <strong>{localizeCopy(average == null ? MISSING_STAT : numberFormat.format(average))}</strong>
          <small>{localizeCopy("Fantasy points")}</small>
        </div>
        <div>
          <span>{localizeCopy("Best performance")}</span>
          <strong>{localizeCopy(best == null ? MISSING_STAT : numberFormat.format(best))}</strong>
          <small>{localizeCopy("Fantasy points")}</small>
        </div>
      </div>

      <div className="player-form-chart-heading">
        <div>
          <h3>{localizeCopy("Points by fixture")}</h3>
          <p>{fixtures.length} {localizeCopy(" LaLiga fixtures shown · Oldest to newest")}</p>
        </div>
        {average != null ? <span className="player-form-average-key">
          <i aria-hidden="true" /> {localizeCopy(" Average ")}{localizeCopy(numberFormat.format(average))}
        </span> : null}
      </div>
      <p className="player-form-chart-help" id={helpId}>
        {localizeCopy("Select a fixture to see match details. ")}{localizeCopy(fixtures.length > 5 ? "Scroll for more fixtures. " : "")}
        {localizeCopy("Use arrow keys when focused.")}</p>

      <div className="player-form-chart">
        <div className="player-form-axis" aria-hidden="true">
          {known.length > 0 ? <>
            {high !== 0 ? <span style={{ top: `${position(high)}%` }}>{localizeCopy(numberFormat.format(high))}</span> : null}
            <span style={{ top: `${zero}%` }}>0</span>
            {low < 0 && low !== high ? <span style={{ top: `${position(low)}%` }}>{localizeCopy(numberFormat.format(low))}</span> : null}
          </> : null}
        </div>
        <div className="player-form-chart-scroll" ref={scrollArea}>
          <div className="player-form-timeline" role="radiogroup" aria-label={localizeCopy("Fixture performance")}
            aria-describedby={helpId} style={{ gridTemplateColumns: `repeat(${fixtures.length}, minmax(${columnWidth}px, 1fr))`, minWidth: `${fixtures.length * columnWidth}px` }}>
            <div className="player-form-chart-guides" aria-hidden="true">
              <span className="player-form-zero-line" style={{ top: `${zero}%` }} />
              {average != null ? <span className="player-form-average-line" style={{ top: `${position(average)}%` }} /> : null}
            </div>
            {fixtures.map((fixture, index) => {
              const isSelected = fixture.key === selected.key;
              const latest = index === fixtures.length - 1;
              const value = fixture.points;
              const pointPosition = position(value ?? 0);
              const valueLabel = value == null ? "Points unavailable" : `${value} fantasy points`;
              return (
                <label className={`player-form-fixture${isSelected ? " is-selected" : ""}`}
                  key={fixture.key} ref={isSelected ? selectedColumn : undefined}>
                  <input type="radio" name={radioName} checked={isSelected}
                    aria-label={localizeCopy(`${fixture.dateLabel}, ${fixture.label}: ${valueLabel}, ${fixture.minutes ?? "unavailable"} minutes${latest ? ". Latest fixture" : ""}`)}
                    aria-controls={detailsId} onChange={() => setSelectedKey(fixture.key)} />
                  <span className="player-form-plot" aria-hidden="true">
                    {value != null && value !== 0 ? <span className={`player-form-bar${value < 0 ? " is-negative" : ""}`}
                      style={{ top: `${Math.min(pointPosition, zero)}%`, height: `${Math.abs(pointPosition - zero)}%` }} /> : null}
                    {value === 0 ? <span className="player-form-zero" style={{ top: `${zero}%` }} /> : null}
                    <strong className={`player-form-score${value == null ? " is-missing" : ""}`}
                      style={{ top: `${pointPosition}%`, transform: value != null && value < 0 ? "translateY(4px)" : "translateY(calc(-100% - 6px))" }}>
                      {localizeCopy(value ?? "—")}
                    </strong>
                  </span>
                  <span className="player-form-fixture-meta" aria-hidden="true">
                    <span className="player-form-fixture-clubs">
                      <span className="player-form-fixture-club">
                        <FormClubBadge media={fixture.homeMedia} name={fixture.home} />
                        <span className="player-form-club-name">{localizeCopy(fixture.home ?? "Unknown club")}</span>
                      </span>
                      <small className="player-form-clubs-versus">{localizeCopy("vs")}</small>
                      <span className="player-form-fixture-club">
                        <FormClubBadge media={fixture.awayMedia} name={fixture.away} />
                        <span className="player-form-club-name">{localizeCopy(fixture.away ?? "Unknown club")}</span>
                      </span>
                    </span>
                    <time dateTime={fixture.date ?? undefined}>
                      <span className="player-form-date-full">{localizeCopy(fixture.dateLabel)}</span>
                      <span className="player-form-date-compact">{localizeCopy(fixture.compactDateLabel)}</span>
                    </time>
                    <span className="player-form-fixture-latest">{localizeCopy(latest ? "Latest" : "\u00a0")}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <section className="player-form-selected" id={detailsId} aria-label={localizeCopy("Selected fixture details")}>
        <div className="player-form-selected-heading" aria-live="polite" aria-atomic="true">
          <div className="player-form-selected-identity">
            <p className="player-form-eyebrow">{localizeCopy(selected.key === fixtures.at(-1)?.key ? "Latest fixture" : "Selected fixture")}</p>
            <div className="player-form-selected-match">
              <span className="player-form-selected-badges" aria-hidden="true">
                <FormClubBadge media={selected.homeMedia} name={selected.home} />
                <FormClubBadge media={selected.awayMedia} name={selected.away} />
              </span>
              <h3>{localizeCopy(selected.label)}</h3>
            </div>
            <time dateTime={selected.date ?? undefined}>{localizeCopy(selected.date?.slice(0, 10) ?? selected.dateLabel)}</time>
          </div>
          <dl className="player-form-selected-scores">
            <div><dt>{localizeCopy("Fantasy points")}</dt><dd>{localizeCopy(selected.points ?? "Unavailable")}</dd></div>
            <div><dt>{localizeCopy("Minutes played")}</dt><dd>{localizeCopy(selected.minutes ?? "Unavailable")}</dd></div>
          </dl>
        </div>
        <Button variant="outline" aria-expanded={showAdvancedStats} aria-controls={showAdvancedStats ? `${detailsId}-stats` : undefined}
          onClick={() => setShowAdvancedStats((value) => !value)}>
          {localizeCopy(showAdvancedStats ? "Hide match statistics" : "Show match statistics")}
        </Button>
        {showAdvancedStats ? <div className="player-form-statistics" id={`${detailsId}-stats`}>
          <p>{localizeCopy("Event counts · Fantasy points in parentheses. A dash means unavailable.")}</p>
          <dl className="player-form-details">
            {STAT_SPECS.map(([key, label]) => <div key={key}>
              <dt>{localizeCopy(key === "daznPoints" ? <><img src={daznIcon} alt="" aria-hidden="true" /> {localizeCopy(" DAZN")}</> : label)}</dt>
              <dd>{localizeCopy(statDisplay(selected.stats?.[key], key))}</dd>
            </div>)}
          </dl>
        </div> : null}
      </section>
    </div>
  );
}
