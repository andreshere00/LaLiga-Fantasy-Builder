import { numberFormatter, dateFormatter } from "../../i18n/format";
import { t, useTranslation } from "../../i18n";
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
  const label = home && away ? t("{{0}} vs {{1}}", { 0: home, 1: away }) : opponent ?? t("Fixture");
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
  useTranslation();
  const initials = name?.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() ?? "?";
  return <span className="player-form-club-badge" title={name ?? t("Club unavailable")}>
    <BadgeImage media={media} fallback={initials} />
  </span>;
}

/** A shared score scale with native radio selection for per-fixture details. */
export function PlayerFormHistory({ rows }: { rows: readonly unknown[] }) {
  useTranslation();
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
      <div className="player-form-metrics" aria-label={t("Shown fixture summary")}>
        <div className="player-form-total">
          <span>{missing > 0 ? t("Known fantasy points") : t("Total fantasy points")}</span>
          <strong>{known.length > 0 ? numberFormat.format(total) : t("Unavailable")}</strong>
          {missing > 0 ? <small>{t(fixtures.length === 1 ? "Points unavailable for {{0}} of {{1}} fixture." : "Points unavailable for {{0}} of {{1}} fixtures.", { 0: missing, 1: fixtures.length })}</small>
            : <small>{t(fixtures.length === 1 ? "Across {{0}} fixture" : "Across {{0}} fixtures", { 0: fixtures.length })}</small>}
        </div>
        <div>
          <span>{missing > 0 ? t("Average · known scores") : t("Average per fixture")}</span>
          <strong>{average == null ? MISSING_STAT : numberFormat.format(average)}</strong>
          <small>{t("Fantasy points")}</small>
        </div>
        <div>
          <span>{t("Best performance")}</span>
          <strong>{best == null ? MISSING_STAT : numberFormat.format(best)}</strong>
          <small>{t("Fantasy points")}</small>
        </div>
      </div>

      <div className="player-form-chart-heading">
        <div>
          <h3>{t("Points by fixture")}</h3>
          <p>{t(fixtures.length === 1 ? "{{0}} LaLiga fixture shown · Oldest to newest" : "{{0}} LaLiga fixtures shown · Oldest to newest", { 0: fixtures.length })}</p>
        </div>
        {average != null ? <span className="player-form-average-key">
          <i aria-hidden="true" /> {t(" Average ")}{numberFormat.format(average)}
        </span> : null}
      </div>
      <p className="player-form-chart-help" id={helpId}>
        {t("Select a fixture to see match details. ")}{fixtures.length > 5 ? t("Scroll for more fixtures. ") : ""}
        {t("Use arrow keys when focused.")}</p>

      <div className="player-form-chart">
        <div className="player-form-axis" aria-hidden="true">
          {known.length > 0 ? <>
            {high !== 0 ? <span style={{ top: `${position(high)}%` }}>{numberFormat.format(high)}</span> : null}
            <span style={{ top: `${zero}%` }}>0</span>
            {low < 0 && low !== high ? <span style={{ top: `${position(low)}%` }}>{numberFormat.format(low)}</span> : null}
          </> : null}
        </div>
        <div className="player-form-chart-scroll" ref={scrollArea}>
          <div className="player-form-timeline" role="radiogroup" aria-label={t("Fixture performance")}
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
              const valueLabel = value == null ? t("Points unavailable") : t("{{0}} fantasy points", { 0: value });
              return (
                <label className={`player-form-fixture${isSelected ? " is-selected" : ""}`}
                  key={fixture.key} ref={isSelected ? selectedColumn : undefined}>
                  <input type="radio" name={radioName} checked={isSelected}
                    aria-label={t("{{0}}, {{1}}: {{2}}, {{3}}{{4}}", { 0: fixture.dateLabel, 1: fixture.label, 2: valueLabel, 3: fixture.minutes == null ? t("Minutes unavailable") : t("{{0}} minutes", { 0: fixture.minutes }), 4: latest ? t(". Latest fixture") : "" })}
                    aria-controls={detailsId} onChange={() => setSelectedKey(fixture.key)} />
                  <span className="player-form-plot" aria-hidden="true">
                    {value != null && value !== 0 ? <span className={`player-form-bar${value < 0 ? " is-negative" : ""}`}
                      style={{ top: `${Math.min(pointPosition, zero)}%`, height: `${Math.abs(pointPosition - zero)}%` }} /> : null}
                    {value === 0 ? <span className="player-form-zero" style={{ top: `${zero}%` }} /> : null}
                    <strong className={`player-form-score${value == null ? " is-missing" : ""}`}
                      style={{ top: `${pointPosition}%`, transform: value != null && value < 0 ? "translateY(4px)" : "translateY(calc(-100% - 6px))" }}>
                      {(value ?? t("—"))}
                    </strong>
                  </span>
                  <span className="player-form-fixture-meta" aria-hidden="true">
                    <span className="player-form-fixture-clubs">
                      <span className="player-form-fixture-club">
                        <FormClubBadge media={fixture.homeMedia} name={fixture.home} />
                        <span className="player-form-club-name">{(fixture.home ?? t("Unknown club"))}</span>
                      </span>
                      <small className="player-form-clubs-versus">{t("vs")}</small>
                      <span className="player-form-fixture-club">
                        <FormClubBadge media={fixture.awayMedia} name={fixture.away} />
                        <span className="player-form-club-name">{(fixture.away ?? t("Unknown club"))}</span>
                      </span>
                    </span>
                    <time dateTime={fixture.date ?? undefined}>
                      <span className="player-form-date-full">{fixture.dateLabel}</span>
                      <span className="player-form-date-compact">{fixture.compactDateLabel}</span>
                    </time>
                    <span className="player-form-fixture-latest">{latest ? t("Latest") : " "}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <section className="player-form-selected" id={detailsId} aria-label={t("Selected fixture details")}>
        <div className="player-form-selected-heading" aria-live="polite" aria-atomic="true">
          <div className="player-form-selected-identity">
            <p className="player-form-eyebrow">{selected.key === fixtures.at(-1)?.key ? t("Latest fixture") : t("Selected fixture")}</p>
            <div className="player-form-selected-match">
              <span className="player-form-selected-badges" aria-hidden="true">
                <FormClubBadge media={selected.homeMedia} name={selected.home} />
                <FormClubBadge media={selected.awayMedia} name={selected.away} />
              </span>
              <h3>{selected.label}</h3>
            </div>
            <time dateTime={selected.date ?? undefined}>{(selected.date?.slice(0, 10) ?? selected.dateLabel)}</time>
          </div>
          <dl className="player-form-selected-scores">
            <div><dt>{t("Fantasy points")}</dt><dd>{(selected.points ?? t("Unavailable"))}</dd></div>
            <div><dt>{t("Minutes played")}</dt><dd>{(selected.minutes ?? t("Unavailable"))}</dd></div>
          </dl>
        </div>
        <Button variant="outline" aria-expanded={showAdvancedStats} aria-controls={showAdvancedStats ? `${detailsId}-stats` : undefined}
          onClick={() => setShowAdvancedStats((value) => !value)}>
          {showAdvancedStats ? t("Hide match statistics") : t("Show match statistics")}
        </Button>
        {showAdvancedStats ? <div className="player-form-statistics" id={`${detailsId}-stats`}>
          <p>{t("Event counts · Fantasy points in parentheses. A dash means unavailable.")}</p>
          <dl className="player-form-details">
            {STAT_SPECS.map(([key, label]) => <div key={key}>
              <dt>{key === "daznPoints" ? <><img src={daznIcon} alt="" aria-hidden="true" /> {t(" DAZN")}</> : t(label)}</dt>
              <dd>{statDisplay(selected.stats?.[key], key)}</dd>
            </div>)}
          </dl>
        </div> : null}
      </section>
    </div>
  );
}
