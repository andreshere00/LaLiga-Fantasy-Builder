import { DateRangeDialog } from "./DateRangeDialog";
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";

import { formatEuro } from "../../api/format";
import { getJson, paths, type PlayerStatsDetailQuery } from "../../api/client";
import {
  asFiniteNumber,
  asRecord,
  callerTeamId,
  catalogMediaByMasterId,
  captainIdOf,
  leagueId,
  mediaFromPlayerMaster,
  playersOf,
  squadCards,
  teamNameFromPlayerMaster,
  text,
} from "../../api/mappers";
import { usePlayerStatsDetailQuery, usePlayersCatalogQuery } from "../../api/queries";
import { useNow } from "../../hooks/useNow";
import { parseMasterPlayerId, type MasterPlayerId } from "../../api/ids";
import { useAuth } from "../../auth/AuthProvider";
import { GatePanel } from "../gates/GatePanel";
import { PlayerTile } from "../lineup/PlayerTile";
import { positionLabel } from "../market/positions";
import { AvailabilityCell } from "../market/cells/AvailabilityCell";
import { availabilityOf } from "../market/model/availability";
import { catalogById } from "../market/model/listing";
import { MarketActionDialogs } from "../market/actions/MarketActionDialogs";
import { MarketActionMenu } from "../market/actions/MarketActionMenu";
import { useMarketActions } from "../market/actions/useMarketActions";
import { useLeague } from "../lineup/LeagueProvider";
import { SquadPlayerActions } from "../lineup/SquadPlayerActions";
import { useSquadSales } from "../lineup/useSquadSales";
import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fixtureDateLabel,
  formatChartAxisDate,
  formatMarketChartTick,
  marketChangeTone,
  marketChartDomain,
  statDisplay,
  withMarketTrend,
  MISSING_STAT,
  NO_DATA_YET,
  deltaRelPercent,
} from "./playerDetailFormat";
import { clubDisplayName } from "./clubNames";
import { PlayerBookmarkButton } from "./PlayerBookmarkButton";
import { usePlayerMarketListing } from "./usePlayerMarketListing";
import { readFavoritePlayerIds, toggleFavoritePlayerId } from "./favorites";
import { rosterPhotoByMasterId, teamIdsFromLeagueTeams } from "./model/playerRow";
import { PlayerMatchesSection } from "./PlayerMatchesSection";
import { PlayerFantasySection } from "./PlayerFantasySection";
import { PlayerAveragesPanel } from "./PlayerAveragesPanel";
import { playerAverages } from "./playerAverages";
import { PlayerDetailScreenLoading } from "./PlayerScreenLoading";
import daznIcon from "../../assets/dazn.png";
import "./PlayerDetailPage.css";

const FIXTURE_LAST_STEPS = [5, 10, 20, 40, 60] as const;
const MARKET_PRESETS = ["season", "30d", "14d", "10d", "5d"] as const;

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

function fixtureLabel(fixture: Record<string, unknown> | null): string {
  if (!fixture) return MISSING_STAT;
  const home = clubDisplayName(text(fixture.homeTeam));
  const away = clubDisplayName(text(fixture.awayTeam));
  if (home && away) return `${home} vs ${away}`;
  const opponent = clubDisplayName(text(fixture.opponent));
  if (opponent) return opponent;
  return MISSING_STAT;
}


function entryKey(parts: readonly (string | null | undefined)[], index: number): string {
  const label = parts.filter((part): part is string => part != null && part.length > 0).join("|");
  return label.length > 0 ? `${label}|${index}` : `row-${index}`;
}

function fixtureKey(fixture: Record<string, unknown> | null, index: number): string {
  return entryKey(
    [
      text(fixture?.date),
      text(fixture?.homeTeam),
      text(fixture?.awayTeam),
      text(fixture?.opponent),
      text(fixture?.competition),
    ],
    index,
  );
}

type PlayerDetailBodyProps = {
  masterId: MasterPlayerId;
};

function PlayerDetailBody({ masterId }: PlayerDetailBodyProps) {
  const location = useLocation();
  const returnTo = location.state?.returnTo === "/market" ? "/market" : "/players";
  const { user, accessToken } = useAuth();
  const userId = user?.userId ?? null;
  const [last, setLast] = useState(5);
  const [marketPreset, setMarketPreset] = useState<(typeof MARKET_PRESETS)[number]>("season");
  const [marketCustomFrom, setMarketCustomFrom] = useState("");
  const [marketCustomTo, setMarketCustomTo] = useState("");
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [marketUseCustomRange, setMarketUseCustomRange] = useState(false);
  const [favorites, setFavorites] = useState(() => readFavoritePlayerIds(userId));
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  const detailQueryInput = useMemo((): PlayerStatsDetailQuery => {
    const base: PlayerStatsDetailQuery = {
      last,
      competition: ["laliga"],
      limit: 5,
      includeWeather: true,
      includeStats: true,
    };
    if (
      marketUseCustomRange &&
      marketCustomFrom &&
      marketCustomTo &&
      marketCustomFrom <= marketCustomTo
    ) {
      return { ...base, from: marketCustomFrom, to: marketCustomTo };
    }
    return { ...base, preset: marketPreset };
  }, [
    last,
    marketCustomFrom,
    marketCustomTo,
    marketPreset,
    marketUseCustomRange,
  ]);

  const signedIn = accessToken != null;
  const catalogQuery = usePlayersCatalogQuery(signedIn);
  const detailQuery = usePlayerStatsDetailQuery(masterId, detailQueryInput, signedIn);

  const league = useLeague();
  const leagueKey = league.selected ? leagueId(league.selected) : "";
  const teamId = league.selected ? callerTeamId(league.selected) : null;
  const leaguePlayerQuery = useQuery({
    queryKey: ["player-league", leagueKey, masterId],
    enabled: signedIn && leagueKey !== "" && masterId != null,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      getJson(paths.playerLeague(masterId ?? "", leagueKey), accessToken ?? "", { signal }),
  });
  const leagueTeamsForMedia = useQuery({
    queryKey: ["league-teams", leagueKey],
    enabled: signedIn && leagueKey !== "",
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => getJson(paths.leagueTeams(leagueKey), accessToken ?? "", { signal }),
  });
  const mediaTeamIds = useMemo(
    () => teamIdsFromLeagueTeams(leagueTeamsForMedia.data),
    [leagueTeamsForMedia.data],
  );
  const mediaRosterQueries = useQueries({
    queries: mediaTeamIds.map((rosterTeamId) => ({
      queryKey: ["team", leagueKey, rosterTeamId],
      enabled: signedIn && leagueKey !== "" && rosterTeamId !== "",
      staleTime: 5 * 60_000,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.team(leagueKey, rosterTeamId), accessToken ?? "", { signal }),
    })),
  });
  const rosterPhotoUrl = rosterPhotoByMasterId(mediaRosterQueries.map((query) => query.data)).get(
    masterId,
  );
  const now = useNow();
  const marketListing = usePlayerMarketListing(masterId);
  const marketActions = useMarketActions();
  const squadSales = useSquadSales();
  const teamQuery = useQuery({
    queryKey: ["team", leagueKey, teamId],
    enabled: signedIn && leagueKey !== "" && teamId != null,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      getJson(paths.team(leagueKey, teamId ?? ""), accessToken ?? "", { signal }),
  });
  const ownSquadCard = useMemo(() => {
    if (!masterId || !teamQuery.data) return null;
    const captainId = captainIdOf(teamQuery.data);
    const cards = squadCards(playersOf(teamQuery.data), captainId);
    return cards.find((card) => card.masterPlayerId === masterId) ?? null;
  }, [masterId, teamQuery.data]);
  const catalog = useMemo(() => catalogById(catalogQuery.data), [catalogQuery.data]);
  const catalogMaster = masterId ? catalog.get(masterId) : null;
  const media = masterId ? catalogMediaByMasterId(catalogQuery.data).get(masterId) : null;
  const leaguePlayer = asRecord(leaguePlayerQuery.data);
  const leagueMaster = asRecord(leaguePlayer?.playerMaster);
  const leagueMedia = mediaFromPlayerMaster(leagueMaster ?? leaguePlayerQuery.data);
  const catalogWeekCount = Array.isArray(catalogMaster?.lastStats)
    ? catalogMaster.lastStats.length
    : 0;
  const leagueWeekCount = Array.isArray(leagueMaster?.lastStats)
    ? leagueMaster.lastStats.length
    : 0;
  const fantasyAveragesPlayer = leagueWeekCount > catalogWeekCount
    ? leagueMaster
    : catalogMaster ?? leagueMaster;

  const detail = asRecord(detailQuery.data);
  const detailReady = detail != null;
  const segmentErrors = Array.isArray(detail?.segmentErrors) ? detail.segmentErrors : [];
  const fixturesBlock = asRecord(detail?.fixtures);
  const marketBlock = asRecord(detail?.market);
  const recentBlock = asRecord(detail?.recent);
  const upcomingBlock = asRecord(detail?.upcoming);
  const profileBlock = asRecord(detail?.profile);

  const name =
    text(catalogMaster?.nickname) ??
    text(catalogMaster?.name) ??
    text(asRecord(detail?.player)?.nickname) ??
    text(asRecord(detail?.player)?.name) ??
    "Player";
  const points = asFiniteNumber(catalogMaster?.points);
  const positionId =
    asFiniteNumber(catalogMaster?.positionId) ??
    asFiniteNumber(asRecord(detail?.player)?.positionId);
  const teamName =
    text(asRecord(detail?.player)?.teamName) ??
    teamNameFromPlayerMaster(catalogMaster);
  const availability = availabilityOf(catalogMaster?.playerStatus);

  const marketRow = marketListing.row;

  const fixtureRows = useMemo(() => {
    const rows = fixturesBlock?.fixtures;
    if (!Array.isArray(rows)) return [];
    return [...rows].reverse();
  }, [fixturesBlock]);

  const marketSeries = useMemo(() => {
    const window = asRecord(marketBlock?.window);
    const series = window?.series;
    if (!Array.isArray(series)) return [];
    const points = series.map((point) => {
      const row = asRecord(point);
      return {
        date: text(row?.date) ?? "",
        value: asFiniteNumber(row?.value) ?? 0,
      };
    });
    return withMarketTrend(points);
  }, [marketBlock]);

  const marketChartYDomain = useMemo(
    () => marketChartDomain(marketSeries.map((point) => point.value)),
    [marketSeries],
  );

  const deltaAbs = asFiniteNumber(asRecord(marketBlock?.window)?.deltaAbs);
  const deltaRel = asFiniteNumber(asRecord(marketBlock?.window)?.deltaRel);
  const currentValue = asFiniteNumber(marketBlock?.currentValue);
  const changeTone = marketChangeTone(deltaRel);
  const averages = playerAverages(profileBlock?.averages, fantasyAveragesPlayer);

  const injury = asRecord(profileBlock?.injury);
  const actionContext = {
    money: marketListing.money,
    now,
    callerTeamId: marketListing.callerTeamId,
    squadPlayerCount: marketListing.squadPlayerCount,
    activeBidCount: marketListing.activeBidCount,
    squadMarketValue: marketListing.squadMarketValue,
  };
  const showMarketMenu = marketRow != null && ownSquadCard == null;

  if (!detailReady && !detailQuery.isError) return <PlayerDetailScreenLoading />;

  return (
    <section className="player-detail-page">
      <nav className="player-detail-back fb-breadcrumb" aria-label="Breadcrumb">
        <Link to={returnTo}>{returnTo === "/market" ? "Market" : "Players"}</Link>
        <span aria-hidden="true">/</span><span aria-current="page">{name}</span>
      </nav>
      {detailQuery.isError ? (
        <p className="status-copy" role="alert">
          Player details could not be loaded.
        </p>
      ) : null}
      {detailQuery.isFetching && detailQuery.isPlaceholderData ? (
        <p className="status-copy" role="status">
          Updating player…
        </p>
      ) : null}
      {detailReady && segmentErrors.length > 0 ? (
        <div className="player-detail-panel player-detail-segment-errors" role="status">
          {segmentErrors.map((entry, index) => {
            const row = asRecord(entry);
            return (
              <p key={`${text(row?.segment)}-${index}`} className="status-copy">
                {text(row?.segment)}: {text(row?.detail) ?? "unavailable"}
              </p>
            );
          })}
        </div>
      ) : null}

      <header className="player-detail-panel player-detail-header">
        <div className="player-detail-header-identity">
          <PlayerTile
            name={name}
            captain={false}
            variant="squad"
            showName={false}
            photoUrl={
              leagueMedia.photoUrl ??
              marketListing.row?.photoUrl ??
              media?.photoUrl ??
              rosterPhotoUrl ??
              ownSquadCard?.photoUrl ??
              null
            }
            photoFallbackUrls={[
              marketListing.row?.photoUrl,
              media?.photoUrl,
              rosterPhotoUrl,
              ownSquadCard?.photoUrl,
            ]}
            teamBadgeUrl={
              leagueMedia.teamBadgeUrl ??
              marketListing.row?.teamBadgeUrl ??
              media?.teamBadgeUrl ??
              ownSquadCard?.teamBadgeUrl ??
              null
            }
          />
          <div className="player-detail-header-text">
            <div className="player-detail-title-row"><h1>{name}</h1>
              <AvailabilityCell availability={availability} /></div>
            <div className="player-detail-header-facts">
              <p>{teamName ?? MISSING_STAT}</p>
              <p>FSYP {points ?? MISSING_STAT}</p>
              <p>{positionLabel(positionId) ?? MISSING_STAT}</p>
            </div>
            {injury?.availabilityText || injury?.diagnosis ? (
              <p className="player-detail-availability-reason">
                {[text(injury.availabilityText), text(injury.diagnosis)].filter(Boolean).join(" — ")}
              </p>
            ) : null}
          </div>
        </div>
        {detailReady || catalogMaster || leagueMaster ? (
          <PlayerAveragesPanel rows={averages} positionId={positionId} />
        ) : null}
        <div className="player-detail-header-actions">
          {ownSquadCard ? (
            <SquadPlayerActions player={ownSquadCard} sales={squadSales}>
              <span className="player-detail-squad-hit">{name}</span>
            </SquadPlayerActions>
          ) : null}
          {showMarketMenu && marketRow ? (
            <MarketActionMenu row={marketRow} context={actionContext} actions={marketActions} />
          ) : null}
          <PlayerBookmarkButton
            pressed={favorites.has(masterId)}
            playerName={name}
            onToggle={() => setFavorites(toggleFavoritePlayerId(userId, masterId))}
          />
        </div>
      </header>

      <section className="player-detail-panel player-detail-section player-form-section">
        <h2>Form — fixture stats</h2>
        <div className="player-detail-fixture-actions">
          {FIXTURE_LAST_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className={last === step ? "is-active" : undefined}
              aria-pressed={last === step}
              onClick={() => setLast(step)}
            >
              Last {step}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={showAdvancedStats}
            aria-controls="player-form-list"
            onClick={() => setShowAdvancedStats((value) => !value)}
          >
            {showAdvancedStats ? "Hide details" : "Details"}
          </button>
        </div>
        {!detailReady ? null : fixturesBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : fixtureRows.length === 0 ? (
          <p className="status-copy">No LaLiga fixture stats available.</p>
        ) : (
          <div id="player-form-list" className="player-form-grid">
            {fixtureRows.map((row, index) => {
              const record = asRecord(row);
              const fixture = asRecord(record?.fixture);
              const stats = asRecord(record?.stats);
              const total = asFiniteNumber(record?.fantasyPointsTotal);
              return (
                <article className="player-form-card" key={fixtureKey(fixture, index)}>
                  <header className="player-form-card-heading">
                    <strong>{fixtureLabel(fixture)}</strong>
                    <time dateTime={text(fixture?.date) ?? undefined}>
                      {fixtureDateLabel(fixture)}
                    </time>
                  </header>
                  <dl className="player-form-summary">
                    <div>
                      <dt>Minutes</dt>
                      <dd>{asFiniteNumber(record?.minutesPlayed) ?? MISSING_STAT}</dd>
                    </div>
                    <div>
                      <dt>Fantasy points</dt>
                      <dd>{total ?? MISSING_STAT}</dd>
                    </div>
                  </dl>
                  {showAdvancedStats ? (
                    <dl className="player-form-details">
                      {STAT_SPECS.map(([key, label]) => (
                        <div key={key}>
                          <dt>
                            {key === "daznPoints" ? (
                              <>
                                <img src={daznIcon} alt="" aria-hidden="true" /> DAZN
                              </>
                            ) : (
                              label
                            )}
                          </dt>
                          <dd>{statDisplay(stats?.[key], key)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </article>
              );
            })}
            <p className="player-form-total">
              Total fantasy points
              <strong>
                {fixtureRows.reduce((sum, row) => {
                  const total = asFiniteNumber(asRecord(row)?.fantasyPointsTotal);
                  return sum + (total ?? 0);
                }, 0)}
              </strong>
            </p>
          </div>
        )}
      </section>

      <section className="player-detail-panel player-detail-section player-market-value-section">
        <h2>Market value</h2>
        <div className="player-detail-market-presets">
          {MARKET_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className={!marketUseCustomRange && marketPreset === value ? "is-active" : undefined}
              aria-pressed={!marketUseCustomRange && marketPreset === value}
              onClick={() => {
                setMarketUseCustomRange(false);
                setMarketPreset(value);
              }}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            className={marketUseCustomRange ? "is-active" : undefined}
            aria-pressed={marketUseCustomRange}
            onClick={() => {
              setDateEditorOpen(true);
            }}
          >
            Custom
          </button>
        </div>
        {dateEditorOpen ? <DateRangeDialog from={marketCustomFrom} to={marketCustomTo}
          onClose={() => setDateEditorOpen(false)} onApply={(from, to) => {
            setMarketCustomFrom(from); setMarketCustomTo(to);
            setMarketUseCustomRange(true); setDateEditorOpen(false);
          }} /> : null}
        {!detailReady ? null : marketBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : marketSeries.length === 0 ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : (
          <>
            <p className="player-detail-deltas">
              <strong>{currentValue != null ? formatEuro(currentValue) : MISSING_STAT}</strong>
              {" · "}
              <span className={`player-detail-market-delta ${changeTone}`}>
                {deltaAbs != null && deltaAbs > 0 ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5m0 0-7 7m7-7 7 7" />
                  </svg>
                ) : null}
                {deltaAbs != null
                  ? `${deltaAbs > 0 ? "+" : ""}${formatEuro(deltaAbs)}`
                  : MISSING_STAT}
              </span>
              {" · "}
              <span className={`player-detail-market-delta ${changeTone}`}>
                {deltaRel != null && deltaRel > 0 ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5m0 0-7 7m7-7 7 7" />
                  </svg>
                ) : null}
                {deltaRelPercent(deltaRel) ?? MISSING_STAT}
              </span>
            </p>
            <div className="player-detail-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={marketSeries}
                  margin={{ top: 12, right: 16, left: 8, bottom: 20 }}
                >
                  <CartesianGrid
                    stroke="var(--fb-line)"
                    strokeDasharray="3 3"
                    vertical={false}
                    horizontal
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatChartAxisDate}
                    minTickGap={28}
                    stroke="var(--fb-muted)"
                    tick={{ fill: "var(--fb-secondary)", fontSize: 11 }}
                    label={{ value: "Date", position: "insideBottom", offset: -8, fill: "var(--fb-secondary)" }}
                  />
                  <YAxis
                    width={64}
                    domain={marketChartYDomain}
                    tickCount={5}
                    allowDecimals={false}
                    tickFormatter={formatMarketChartTick}
                    stroke="var(--fb-muted)"
                    tick={{ fill: "var(--fb-secondary)", fontSize: 11 }}
                    label={{
                      value: "Value (€)",
                      angle: -90,
                      position: "insideLeft",
                      fill: "var(--fb-secondary)",
                    }}
                  />
                  <Legend />
                  <Tooltip
                    contentStyle={{ background: "var(--fb-surface)", color: "var(--fb-secondary)", border: "1px solid var(--fb-line)", borderRadius: 0 }}
                    labelStyle={{ color: "var(--fb-secondary)" }}
                    labelFormatter={(label) => formatChartAxisDate(String(label ?? ""))}
                    formatter={(value, name) => [
                      formatEuro(Number(value)),
                      name === "Trend" ? "Trend" : "Value",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    name="Trend"
                    stroke="var(--fb-muted)"
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Value"
                    stroke="#FF4B44"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      {detailReady ? (
        <PlayerMatchesSection recent={recentBlock} upcoming={upcomingBlock} />
      ) : null}


      {detailReady ? <PlayerFantasySection profile={profileBlock} /> : null}

      <MarketActionDialogs
        actions={marketActions}
        money={marketListing.money}
        squadMarketValue={marketListing.squadMarketValue}
      />
    </section>
  );
}

export function PlayerDetailPage() {
  const { playerId: rawId } = useParams<{ playerId: string }>();
  const masterId = parseMasterPlayerId(rawId ?? "");
  const { status, user } = useAuth();
  if (status !== "ready") return <GatePanel status={status} />;
  if (!masterId) {
    return (
      <p className="status-copy" role="alert">
        Invalid player id.
      </p>
    );
  }
  return <PlayerDetailBody key={user?.userId ?? ""} masterId={masterId} />;
}
