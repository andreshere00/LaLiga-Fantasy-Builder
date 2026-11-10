import { useEffect, useMemo, useState, type Ref } from "react";
import { Link, useLocation } from "react-router-dom";
import { playersFilterPath } from "../players/playersSearchParams";
import { PlayerLink } from "../../components/links/EntityLinks";
import { t, useTranslation } from "../../i18n";
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
import { BouncingBall } from "../../components/BouncingBall";
import { Skeleton } from "../../components/ui/Skeleton";
import { RecentPoints } from "./RecentPoints";
import { useRecentPoints, type RecentPoint } from "./useRecentPoints";
import { TeamHierarchySection } from "./TeamHierarchySection";
import { TeamMeter } from "./TeamMeter";
import { TeamSummary } from "./TeamSummary";
import { publishedColumns, sortSquad, splitIdle, type SquadColumn, type SquadRow } from "./teamTable";

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

export function TeamPlayersSection({
  roster,
  seasonStats,
  clubName,
}: {
  roster: Roster;
  clubName?: string | null;
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
      if (counted?.available) return { ...row, stats: counted.stats as SquadRow["stats"] };
      // Season totals are in: a player without a profile must not keep short-window counts.
      return season ? { ...row, stats: {} } : row;
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
  const rows = useMemo(() => sortSquad(source, column, direction), [source, column, direction]);
  const weeks = roster.coverage.matchweeks.join(", ");
  const unavailable = season?.coverage.unavailable ?? 0;
  const maxPoints = Math.max(0, ...rows.map((row) => row.points ?? 0));
  // Players with zero minutes add noise to the table, so they wait behind a toggle.
  const { played, idle } = useMemo(() => splitIdle(rows), [rows]);
  const foldIdle = idle.length > 0;
  const idleIds = useMemo(() => new Set(idle.map((row) => row.playerId)), [idle]);
  const [showIdle, setShowIdle] = useState(false);
  const columns = 3 + statColumns.length;
  const renderRow = (row: SquadRow) => (
    <tr key={row.playerId}>
      <th className="is-player" scope="row">
        <PlayerLink className="team-player-link" playerId={row.playerId} returnTo={returnTo}>
          {row.name}
        </PlayerLink>
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
  );
  return (
    <section id="team-players" tabIndex={-1} aria-labelledby="team-players-title">
      <h2 id="team-players-title" className="team-section-title">{t("Players")}</h2>
      <div className="team-block">
        <h3 id="team-mvps-title">{t("MVPs")}</h3>
        <TeamSummary id="team-summary-mvps" widget="mvps" />
        <MvpStrip
          players={roster.mvps}
          outlooks={outlooks.profiles}
          outlooksLoading={outlooks.isLoading}
          media={media}
          recent={recent}
          returnTo={returnTo}
        />
      </div>
      <div className="team-block">
        <h3 id="team-squad-title">{t("Squad")}</h3>
        <TeamSummary id="team-summary-squad" widget="squad" />
        {clubName ? (
          <p className="team-note">
            <Link className="entity-link" to={playersFilterPath({ team: clubName })}>
              {t("Compare all {{0}} players on Players →", { 0: clubName })}
            </Link>
          </p>
        ) : null}
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
          <p className="team-note team-loading" role="status">
            <BouncingBall size="sm" />
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
          aria-labelledby="team-squad-title"
          aria-describedby="team-summary-squad"
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
            <tbody>{(foldIdle ? played : rows).map(renderRow)}</tbody>
            {foldIdle ? (
              <>
                <tbody className="team-idle-toggle">
                  <tr>
                    <td colSpan={columns}>
                      <button
                        type="button"
                        aria-expanded={showIdle}
                        aria-controls="team-squad-idle"
                        onClick={() => setShowIdle((current) => !current)}
                      >
                        <span className="team-idle-chevron" aria-hidden="true" />
                        {showIdle ? t("Hide players without minutes") : t("Show players without minutes")}
                        <span className="team-count">{idle.length}</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tbody id="team-squad-idle" hidden={!showIdle}>{idle.map(renderRow)}</tbody>
              </>
            ) : null}
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
      <TeamHierarchySection players={roster.players} returnTo={returnTo} idleIds={idleIds} />
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

type Outlook = {
  birthDate?: string | null;
  form?: { rating?: string | null } | null;
  startProbability?: { percent?: number | null } | null;
};

/** Starter likelihood from this percentage up is flagged in red on the MVP cards. */
const STARTER_RED_FROM = 90;

export function isStarterFlagged(percent: number | null | undefined): boolean {
  return typeof percent === "number" && Number.isFinite(percent) && percent >= STARTER_RED_FROM;
}

function MvpStrip({
  players,
  outlooks,
  outlooksLoading,
  media,
  recent,
  returnTo,
}: {
  players: Roster["mvps"];
  outlooks: { get(playerId: string): unknown };
  outlooksLoading: boolean;
  media: ReadonlyMap<string, { photoUrl: string | null }>;
  recent: ReadonlyMap<string, readonly RecentPoint[]>;
  returnTo: string;
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
      <ul className="team-mvp-list" aria-labelledby="team-mvps-title"
        aria-describedby="team-summary-mvps">
        {shown.map(({ player, radar, published }, index) => {
          const outlook = outlooks.get(player.playerId) as Outlook | undefined;
          const starter = outlook?.startProbability?.percent;
          const flagged = isStarterFlagged(starter);
          const form = playerFormPresentation(outlook?.form?.rating);
          const displayed = radar.displayed;
          const age = playerAge(outlook?.birthDate, Date.now());
          const position = player.positionId != null ? positionLabel(player.positionId) : null;
          const radarLoading = radar.query?.isLoading === true;
          return (
            <li key={player.playerId} className="team-mvp-card"
              aria-busy={outlooksLoading || radarLoading || undefined}>
              <div ref={radar.section as Ref<HTMLDivElement>}>
                <div className="team-mvp-head">
                  <span className="team-mvp-rank" aria-hidden="true">{index + 1}</span>
                  <ProfilePhoto
                    className="team-mvp-photo"
                    url={media.get(player.playerId)?.photoUrl ?? null}
                    fallback={<PersonIcon />}
                  />
                  <div className="team-mvp-name">
                    <h4><PlayerLink playerId={player.playerId} returnTo={returnTo}>{player.name}</PlayerLink></h4>
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
                      {outlooksLoading && !outlook ? (
                        <Skeleton className="team-mvp-skeleton-value" />
                      ) : form ? (
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
                      {outlooksLoading && !outlook ? (
                        <Skeleton className="team-mvp-skeleton-value" />
                      ) : (
                      <>
                      <span className="team-starter-value">
                        {starter == null ? "—" : `${starter}%`}
                        {flagged ? <span className="visually-hidden"> {t("(90% or more)")}</span> : null}
                      </span>
                      <TeamMeter percent={starter} tone={flagged ? "red" : undefined} />
                      </>
                      )}
                    </dd>
                  </div>
                </dl>
                {radarLoading ? (
                  <div className="team-mvp-radar" aria-hidden="true">
                    <Skeleton className="team-mvp-skeleton-radar" />
                  </div>
                ) : null}
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

function formatCount(value: unknown): string {
  return typeof value === "number" ? String(value) : "—";
}
