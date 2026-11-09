import { useEffect, useMemo, useState, type Ref } from "react";
import { Link, useLocation } from "react-router-dom";
import { t, useTranslation } from "../../i18n";
import { dateFormatter } from "../../i18n/format";
import { Badge } from "../../components/ui/Badge";
import { playerAge } from "../players/playerDetailFormat";
import { positionAbbrev, positionLabel, positionTone } from "../market/positions";
import { usePlayerOutlooks } from "../lineup/useSquadStats";
import { radarMetric } from "../players/radar/radarLocalization";
import { PlayerRadarChart } from "../players/radar/PlayerRadarChart";
import { playerFormPresentation } from "../players/playerForm";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { PersonIcon } from "../shell/icons";
import { usePlayersCatalogQuery } from "../../api/queries";
import { catalogMediaByMasterId } from "../../api/mappers";
import { usePlayerRadar } from "../players/radar/usePlayerRadar";
import type { ClubDossierDto, ClubRosterStatsDto } from "../../api/schemas";
import { useRecentPoints, type RecentPoint } from "./useRecentPoints";
import { TeamMeter } from "./TeamMeter";
import { publishedColumns, sortSquad, type SquadColumn, type SquadRow } from "./teamTable";

type Roster = NonNullable<ClubDossierDto["roster"]>;

/** State of the separate season-totals read. Optional so the table works without it. */
export type SeasonStatsState = {
  data: ClubRosterStatsDto | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
};

const COLUMN_LABELS: Record<SquadColumn, string> = {
  points: "FSYP",
  minutes: "Minutes",
  goals: "Goals",
  assists: "Assists",
  dribbles: "Dribbles",
  penaltiesCommitted: "Penalties committed",
  penaltiesSaved: "Penalties saved",
  shots: "Shots",
  recoveries: "Recoveries",
  saves: "Saves",
  ballsLost: "Balls lost",
  yellowCards: "Yellow cards",
  redCards: "Red cards",
};

const INJURY_LABELS: Record<string, string> = {
  "Pendiente pruebas": "Awaiting tests",
  Postoperatorio: "Post-operative",
  Rehabilitación: "Rehabilitation",
  "Trabajo de campo": "Field work",
  "Parcial con el grupo": "Partial training with the group",
  "Grupo sin el alta": "Training with the group",
};

export function TeamPlayersSection({
  roster,
  injuries,
  seasonStats,
}: {
  roster: Roster;
  injuries: ClubDossierDto["injuries"];
  seasonStats?: SeasonStatsState;
}) {
  useTranslation();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const season = seasonStats?.data;
  const outlooks = usePlayerOutlooks(roster.mvps.map((player) => player.playerId));
  const catalog = usePlayersCatalogQuery(true);
  const media = useMemo(() => catalogMediaByMasterId(catalog.data), [catalog.data]);
  const recent = useRecentPoints(roster.mvps.map((player) => player.playerId));
  const [column, setColumn] = useState<SquadColumn | "position">("position");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const source = useMemo(() => {
    const byId = new Map(season?.players.map((entry) => [entry.playerId, entry]) ?? []);
    return roster.players.map((player) => {
      const row = toRow(player);
      const counted = byId.get(player.playerId);
      return counted?.available ? { ...row, stats: counted.stats as SquadRow["stats"] } : row;
    });
  }, [roster, season]);
  const totals = (season?.totals ?? roster.totals) as Record<string, unknown>;
  const statColumns = useMemo(() => publishedColumns(source, totals), [source, totals]);
  useEffect(() => {
    if (column !== "position" && column !== "points" && !statColumns.includes(column)) {
      setColumn("position");
      setDirection("asc");
    }
  }, [column, statColumns]);
  const rows = sortSquad(source, column, direction);
  const weeks = roster.coverage.matchweeks.join(", ");
  const unavailable = season?.coverage.unavailable ?? 0;
  const maxPoints = Math.max(0, ...rows.map((row) => row.points ?? 0));
  return (
    <section id="team-players" tabIndex={-1} aria-labelledby="team-players-title">
      <h2 id="team-players-title" className="team-section-title">{t("Players")}</h2>
      <div className="team-block">
        <h3>{t("MVPs")}</h3>
        <MvpStrip
          players={roster.mvps}
          outlooks={outlooks.profiles}
          media={media}
          recent={recent}
        />
      </div>
      <div className="team-block">
        <h3>
          {t("Injured players")}
          {injuries?.published && injuries.items.length > 0
            ? <span className="team-count">{injuries.items.length}</span>
            : null}
        </h3>
        <TeamInjuryList injuries={injuries} />
      </div>
      <div className="team-block">
        <h3>{t("Squad")}</h3>
        <p className="team-note">
          {season
            ? t("{{0}} players. LaLiga {{1}} season totals from FutbolFantasy.", {
              0: roster.coverage.players,
              1: season.season,
            })
            : roster.coverage.matchweeks.length > 0
              ? t("{{0}} players across matchweeks {{1}}.", { 0: roster.coverage.players, 1: weeks })
              : t("{{0}} players. Matchweek coverage was not published.", {
                0: roster.coverage.players,
              })}
          {!season && roster.coverage.shortWindow ? ` ${t("Totals cover a short window.")}` : ""}
          {unavailable > 0
            ? ` ${unavailable === 1
              ? t("Counts are blank for 1 player without a published profile.")
              : t("Counts are blank for {{0}} players without a published profile.", {
                0: unavailable,
              })}`
            : ""}
        </p>
        {seasonStats?.loading ? (
          <p className="team-note" role="status">
            {t("Loading season statistics. The first read of a club can take about half a minute.")}
          </p>
        ) : null}
        {seasonStats?.failed ? (
          <p role="alert">
            {t("Season statistics could not be loaded.")}
            <button type="button" onClick={seasonStats.onRetry}>{t("Retry")}</button>
          </p>
        ) : null}
        <div
          className={statColumns.length > 0 ? "team-table-wrap" : "team-table-wrap is-compact"}
          tabIndex={0}
          role="region"
          aria-label={t("Squad")}
        >
          <table className="team-table team-squad-table">
            <thead>
              <tr>
                <th className="is-player" scope="col">{t("Player")}</th>
                <SortHeader
                  label={t("Position")}
                  column="position"
                  active={column}
                  direction={direction}
                  className="is-position"
                  onSort={toggle}
                />
                <SortHeader
                  label={t("FSYP")}
                  column="points"
                  active={column}
                  direction={direction}
                  className="is-points"
                  onSort={toggle}
                />
                {statColumns.map((key) => (
                  <SortHeader
                    key={key}
                    label={t(COLUMN_LABELS[key])}
                    column={key}
                    active={column}
                    direction={direction}
                    onSort={toggle}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.playerId}>
                  <th className="is-player" scope="row">
                    <Link
                      className="team-player-link"
                      to={`/players/${encodeURIComponent(row.playerId)}`}
                      state={{ returnTo }}
                    >
                      {row.name}
                    </Link>
                  </th>
                  <td className="is-position">
                    <span
                      className={`team-pos team-pos--${positionTone(row.positionId)}`}
                      title={positionLabel(row.positionId) ?? undefined}
                    >
                      {positionAbbrev(row.positionId)}
                    </span>
                  </td>
                  <td className="is-points">
                    <span className={row.points ? "" : "is-zero"}>{formatCount(row.points)}</span>
                    <TeamMeter percent={maxPoints > 0 && row.points ? (row.points / maxPoints) * 100 : 0} />
                  </td>
                  {statColumns.map((key) => (
                    <td key={key} className={row.stats[key] ? "" : "is-zero"}>
                      {formatCount(row.stats[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="is-player" scope="row">{t("Totals")}</th>
                <td className="is-position" />
                <td className="is-points" />
                {statColumns.map((key) => <td key={key}>{formatCount(totals[key])}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );

  function toggle(next: SquadColumn | "position") {
    if (column === next) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setColumn(next);
      setDirection(next === "position" ? "asc" : "desc");
    }
  }
}

export function TeamInjuryList({
  injuries,
}: {
  injuries: ClubDossierDto["injuries"];
}) {
  useTranslation();
  if (!injuries) return null;
  if (!injuries.published) return <p>{t("Current injuries are not published for this club.")}</p>;
  if (injuries.items.length === 0) return <p>{t("No current injuries were published.")}</p>;
  return (
    <div className="team-table-wrap">
      <table className="team-table team-injury-table">
        <caption className="visually-hidden">{t("Injured players")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("Player")}</th>
            <th scope="col">{t("Injury status")}</th>
            <th scope="col">{t("Expected return")}</th>
            <th scope="col">{t("Started")}</th>
          </tr>
        </thead>
        <tbody>
          {injuries.items.map((item) => (
            <tr key={`${item.name}-${item.startedOn ?? ""}`}>
              <th scope="row">{item.name}</th>
              <td data-label={t("Injury status")}>
                {item.status
                  ? <Badge>{t(INJURY_LABELS[item.status] ?? item.status)}</Badge>
                  : "—"}
              </td>
              <td data-label={t("Expected return")}>{item.expectedReturn || "—"}</td>
              <td data-label={t("Started")}>
                {item.startedOn
                  ? <time dateTime={item.startedOn}>{startedLabel(item.startedOn)}</time>
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Outlook = {
  birthDate?: string | null;
  form?: { rating?: string | null } | null;
  startProbability?: { percent?: number | null } | null;
};

/** The last five LaLiga matches' Fantasy points, oldest first, beside the season total. */
function RecentPoints({ entries }: { entries: readonly RecentPoint[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="team-mvp-recent">
      <p>{t("Last 5 LaLiga matches")}</p>
      <ol aria-label={t("Fantasy points in the last 5 LaLiga matches, oldest to newest")}>
        {entries.map((entry, index) => (
          <li
            key={`${entry.matchweek ?? "x"}-${index}`}
            data-tone={entry.points == null ? undefined : entry.points < 0 ? "low" : entry.points >= 10 ? "high" : "mid"}
            title={entry.matchweek != null ? t("Matchweek {{0}}", { 0: entry.matchweek }) : undefined}
          >
            {entry.points ?? "—"}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Starter likelihood from this percentage up is flagged in red on the MVP cards. */
const STARTER_RED_FROM = 90;

export function isStarterFlagged(percent: number | null | undefined): boolean {
  return typeof percent === "number" && Number.isFinite(percent) && percent >= STARTER_RED_FROM;
}

function MvpStrip({
  players,
  outlooks,
  media,
  recent,
}: {
  players: Roster["mvps"];
  outlooks: { get(playerId: string): unknown };
  media: ReadonlyMap<string, { photoUrl: string | null }>;
  recent: ReadonlyMap<string, readonly RecentPoint[]>;
}) {
  const first = usePlayerRadar(players[0]?.playerId ?? "");
  const second = usePlayerRadar(players[1]?.playerId ?? "");
  const third = usePlayerRadar(players[2]?.playerId ?? "");
  const radars = [first, second, third];
  const shown = players.map((player, index) => ({
    player,
    radar: radars[index] ?? first,
    published: topAxes(radars[index] ?? first).length > 0,
  }));
  const settled = shown.every(({ radar }) => (
    radar.query == null || radar.query.isSuccess || radar.query.isError
  ));
  const unpublished = players.length > 0 && settled
    && shown.every(({ published }) => !published);
  return (
    <div>
      <ul className="team-mvp-list">
        {shown.map(({ player, radar, published }, index) => {
          const outlook = outlooks.get(player.playerId) as Outlook | undefined;
          const starter = outlook?.startProbability?.percent;
          const flagged = isStarterFlagged(starter);
          const form = playerFormPresentation(outlook?.form?.rating);
          const displayed = radar.displayed;
          const age = playerAge(outlook?.birthDate, Date.now());
          const position = player.positionId != null ? positionLabel(player.positionId) : null;
          return (
            <li key={player.playerId} className="team-mvp-card">
              <div ref={radar.section as Ref<HTMLDivElement>}>
                <div className="team-mvp-head">
                  <span className="team-mvp-rank" aria-hidden="true">{index + 1}</span>
                  <ProfilePhoto
                    className="team-mvp-photo"
                    url={media.get(player.playerId)?.photoUrl ?? null}
                    fallback={<PersonIcon />}
                  />
                  <div className="team-mvp-name">
                    <h4>{player.name}</h4>
                    {position || age != null ? (
                      <p className="team-mvp-meta">
                        {[position ? t(position) : null, age != null ? `${age}${t(" years old")}` : null]
                          .filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {player.positionId != null ? (
                    <span
                      className={`team-pos team-pos--${positionTone(player.positionId)}`}
                      title={positionLabel(player.positionId) ?? undefined}
                    >
                      {positionAbbrev(player.positionId)}
                    </span>
                  ) : null}
                </div>
                <div className="team-mvp-score">
                  <p className="team-mvp-points">
                    <span>{t("FSYP")}</span>
                    {player.points}
                  </p>
                  <RecentPoints entries={recent.get(player.playerId) ?? []} />
                </div>
                <dl className="team-mvp-facts">
                  <div>
                    <dt>{t("Form")}</dt>
                    <dd>
                      {form ? (
                        <span className="team-mvp-form" data-form={form.code}>
                          <img className="is-light" src={form.icons.light} alt="" />
                          <img className="is-dark" src={form.icons.dark} alt="" />
                          {t(form.label)}
                        </span>
                      ) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Starter likelihood")}</dt>
                    <dd data-level={flagged ? "high" : undefined}>
                      <span className="team-starter-value">
                        {starter == null ? "—" : `${starter}%`}
                        {flagged ? <span className="visually-hidden"> {t("(90% or more)")}</span> : null}
                      </span>
                      <TeamMeter percent={starter} tone={flagged ? "red" : undefined} />
                    </dd>
                  </div>
                </dl>
                {published && displayed ? (
                  <div className="team-mvp-radar">
                    <p>{t("Radar percentiles")}</p>
                    <PlayerRadarChart radar={displayed} compact />
                    <table className="visually-hidden">
                      <caption>{t("Percentiles for ")}{player.name}</caption>
                      <tbody>
                        {displayed.axes.filter((axis) => axis.percentile != null).map((axis) => (
                          <tr key={axis.key}>
                            <th scope="row">{radarMetric(axis).label}</th>
                            <td>{Math.round(axis.percentile ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {unpublished ? <p className="team-mvp-note">{t("Radar is not published for these players.")}</p> : null}
    </div>
  );
}

function topAxes(radar: ReturnType<typeof usePlayerRadar>) {
  return [...(radar.displayed?.axes ?? [])]
    .filter((axis) => axis.percentile != null)
    .sort((left, right) => (right.percentile ?? 0) - (left.percentile ?? 0))
    .slice(0, 3);
}

function toRow(player: Roster["players"][number]): SquadRow {
  return {
    playerId: player.playerId,
    name: player.name,
    positionId: player.positionId ?? null,
    points: player.points ?? null,
    stats: player.stats as SquadRow["stats"],
  };
}

function SortHeader({
  label, column, active, direction, className, onSort,
}: {
  label: string;
  column: SquadColumn | "position";
  active: SquadColumn | "position";
  direction: "asc" | "desc";
  className?: string;
  onSort: (column: SquadColumn | "position") => void;
}) {
  const sorted = active === column;
  return (
    <th className={className} aria-sort={sorted ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(column)}>
        {label}
        {sorted ? <span aria-hidden="true">{direction === "asc" ? " ↑" : " ↓"}</span> : null}
      </button>
    </th>
  );
}

function startedLabel(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return dateFormatter({
    day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid",
  }).format(parsed);
}

function formatCount(value: unknown): string {
  return typeof value === "number" ? String(value) : "—";
}
