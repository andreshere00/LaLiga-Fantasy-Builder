import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { formatEuro } from "../../api/format";
import { getJson, paths, type PlayerStatsDetailQuery } from "../../api/client";
import {
  asFiniteNumber,
  asRecord,
  callerTeamId,
  catalogMediaByMasterId,
  captainIdOf,
  leagueId,
  playersOf,
  squadCards,
  text,
} from "../../api/mappers";
import { usePlayerStatsDetailQuery, usePlayersCatalogQuery } from "../../api/queries";
import { useNow } from "../../hooks/useNow";
import { useRetained } from "../../hooks/useRetained";
import { parseMasterPlayerId } from "../../api/ids";
import { useAuth } from "../../auth/AuthProvider";
import { GatePanel } from "../gates/GatePanel";
import { PlayerTile } from "../lineup/PlayerTile";
import { positionLabel } from "../market/positions";
import { AvailabilityCell } from "../market/cells/AvailabilityCell";
import { availabilityOf } from "../market/model/availability";
import { catalogById } from "../market/model/listing";
import { BidDialog } from "../market/actions/BidDialog";
import { ClauseDialog } from "../market/actions/ClauseDialog";
import { MarketActionMenu } from "../market/actions/MarketActionMenu";
import { WithdrawDialog } from "../market/actions/WithdrawDialog";
import { useMarketActions } from "../market/actions/useMarketActions";
import { useMarketBoard } from "../market/useMarketBoard";
import { useLeague } from "../lineup/LeagueProvider";
import { SquadPlayerActions } from "../lineup/SquadPlayerActions";
import { useSquadSales } from "../lineup/useSquadSales";
import fantasyLogo from "../../assets/fantasy_logo.png";
import hierarchyGod from "../../assets/button_hierarchy_god.svg";
import hierarchyKey from "../../assets/button_hierarchy_key.svg";
import hierarchyImportant from "../../assets/button_hierarchy_important.svg";
import hierarchyRotation from "../../assets/button_hierarchy_rotation.svg";
import hierarchyReserve from "../../assets/button_hierarchy_reserve.svg";
import starterHigh from "../../assets/button_starter_high.svg";
import starterMid from "../../assets/button_starter_mid.svg";
import starterLow from "../../assets/button_starter_low.svg";
import injuryGreen from "../../assets/button_injury_green.svg";
import injuryYellow from "../../assets/button_injury_yellow.svg";
import injuryRed from "../../assets/button_injury_red.svg";
import injuryGray from "../../assets/button_injury_gray.svg";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatChartAxisDate,
  formatMarketChartTick,
  marketChartDomain,
  formatInjuryHistoryEntry,
  newsItemHref,
  MISSING_STAT,
  NO_DATA_YET,
  deltaRelPercent,
  statCount,
  windKmhFromMs,
} from "./playerDetailFormat";
import { PlayerBookmarkButton } from "./PlayerBookmarkButton";
import { readFavoritePlayerIds, toggleFavoritePlayerId } from "./favorites";
import "./PlayerDetailPage.css";

const FIXTURE_LAST_STEPS = [5, 10, 20, 40, 60] as const;
const MARKET_PRESETS = ["season", "30d", "14d", "10d", "5d"] as const;

const STAT_KEYS = [
  "minutes_played",
  "goals",
  "assists",
  "big_chances_created",
  "balls_into_box",
  "penalties_won",
  "penalties_committed",
  "penalties_saved",
  "saves",
  "clearances",
  "penalties_missed",
  "own_goals",
  "goals_conceded",
  "yellow_cards",
  "red_card",
  "shots",
  "successful_dribbles",
  "recoveries",
  "balls_lost",
  "dazn_points",
] as const;

const AVERAGE_PLACEHOLDER = [
  ["G", "Goals"],
  ["TaP", "Shots on target"],
  ["T", "Shots"],
  ["CF", "Corners won"],
  ["Reg", "Successful dribbles"],
  ["C", "Crosses"],
  ["CP", "Accurate crosses"],
  ["A", "Assists"],
  ["A SinGol", "Assists without a goal"],
  ["PC", "Key passes"],
  ["Pas", "Completed passes"],
  ["-Pos", "Possessions lost"],
  ["DE", "Effective clearances"],
  ["PI", "Interceptions"],
  ["BR", "Balls recovered"],
  ["FR", "Fouls won"],
  ["-FC", "Fouls committed"],
] as const;

function hierarchyIcon(label: string | null | undefined): string {
  const key = (label ?? "").trim().toLowerCase();
  if (key.includes("dios") || key === "god") return hierarchyGod;
  if (key.includes("clave") || key.includes("key")) return hierarchyKey;
  if (key.includes("importante") || key.includes("important")) return hierarchyImportant;
  if (key.includes("rotación") || key.includes("rotation") || key.includes("revulsivo")) {
    return hierarchyRotation;
  }
  if (key.includes("reserva") || key.includes("reserve")) return hierarchyReserve;
  return hierarchyImportant;
}

function starterIcon(percent: number | null): string {
  if (percent == null) return starterLow;
  if (percent >= 75) return starterHigh;
  if (percent >= 50) return starterMid;
  return starterLow;
}

function injuryIcon(level: string | null | undefined): string {
  switch (level) {
    case "low":
      return injuryGreen;
    case "medium":
      return injuryYellow;
    case "high":
      return injuryRed;
    default:
      return injuryGray;
  }
}

function fixtureLabel(fixture: Record<string, unknown> | null): string {
  if (!fixture) return MISSING_STAT;
  const home = text(fixture.home_team);
  const away = text(fixture.away_team);
  if (home && away) return `${home} vs ${away}`;
  const opponent = text(fixture.opponent);
  if (opponent) return opponent;
  return MISSING_STAT;
}

export function PlayerDetailPage() {
  const { playerId: rawId } = useParams<{ playerId: string }>();
  const masterId = parseMasterPlayerId(rawId ?? "");
  const { status, user, accessToken } = useAuth();
  const userId = user?.user_id ?? null;
  const [last, setLast] = useState(5);
  const [marketPreset, setMarketPreset] = useState<string>("season");
  const [marketCustomFrom, setMarketCustomFrom] = useState("");
  const [marketCustomTo, setMarketCustomTo] = useState("");
  const [marketCustomDraftFrom, setMarketCustomDraftFrom] = useState("");
  const [marketCustomDraftTo, setMarketCustomDraftTo] = useState("");
  const [marketUseCustomRange, setMarketUseCustomRange] = useState(false);
  const [favorites, setFavorites] = useState(() => readFavoritePlayerIds(userId));
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  const detailQueryInput = useMemo((): PlayerStatsDetailQuery => {
    const base: PlayerStatsDetailQuery = {
      last,
      limit: 5,
      include_weather: true,
      include_stats: true,
    };
    if (marketUseCustomRange && marketCustomFrom && marketCustomTo) {
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

  const catalogQuery = usePlayersCatalogQuery(status === "ready");
  const detailQuery = usePlayerStatsDetailQuery(
    masterId,
    detailQueryInput,
    status === "ready" && masterId != null,
  );

  const league = useLeague();
  const leagueKey = league.selected ? leagueId(league.selected) : "";
  const teamId = league.selected ? callerTeamId(league.selected) : null;
  const now = useNow();
  const marketBoard = useMarketBoard();
  const marketActions = useMarketActions();
  const squadSales = useSquadSales();
  const withdraw = useRetained(marketActions.pendingWithdraw);
  const teamQuery = useQuery({
    queryKey: ["team", leagueKey, teamId],
    enabled: status === "ready" && leagueKey !== "" && teamId != null,
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

  const detail = asRecord(detailQuery.data);
  const segmentErrors = Array.isArray(detail?.segment_errors) ? detail.segment_errors : [];
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
  const positionId = asFiniteNumber(catalogMaster?.positionId);
  const availability = availabilityOf(catalogMaster?.playerStatus);

  const marketRow = useMemo(
    () => marketBoard.rows.find((row) => row.playerId === masterId) ?? null,
    [marketBoard.rows, masterId],
  );

  const fixtureRows = useMemo(() => {
    const rows = fixturesBlock?.fixtures;
    if (!Array.isArray(rows)) return [];
    return [...rows].reverse();
  }, [fixturesBlock]);

  const marketSeries = useMemo(() => {
    const window = asRecord(marketBlock?.window);
    const series = window?.series;
    if (!Array.isArray(series)) return [];
    return series.map((point) => {
      const row = asRecord(point);
      return {
        date: text(row?.date) ?? "",
        value: asFiniteNumber(row?.value) ?? 0,
      };
    });
  }, [marketBlock]);

  const marketChartYDomain = useMemo(
    () => marketChartDomain(marketSeries.map((point) => point.value)),
    [marketSeries],
  );

  const deltaAbs = asFiniteNumber(asRecord(marketBlock?.window)?.delta_abs);
  const deltaRel = asFiniteNumber(asRecord(marketBlock?.window)?.delta_rel);

  const injury = asRecord(profileBlock?.injury);
  const hierarchy = asRecord(profileBlock?.hierarchy);
  const startProb = asRecord(profileBlock?.start_probability);
  const injuryRisk = asRecord(profileBlock?.injury_risk);
  const news = Array.isArray(profileBlock?.news) ? profileBlock.news : [];
  const injuryHistory = Array.isArray(profileBlock?.injury_history)
    ? profileBlock.injury_history
    : [];

  if (status !== "ready") return <GatePanel status={status} />;
  if (!masterId) {
    return (
      <p className="status-copy" role="alert">
        Invalid player id.
      </p>
    );
  }

  const actionContext = {
    money: marketBoard.money,
    now,
    callerTeamId: marketBoard.callerTeamId,
    squadPlayerCount: marketBoard.squadPlayerCount,
    activeBidCount: marketBoard.activeBidCount,
    squadMarketValue: marketBoard.squadMarketValue,
  };
  const showMarketMenu = marketRow != null && ownSquadCard == null;
  const showBookmark = !showMarketMenu && ownSquadCard == null;

  return (
    <section className="player-detail-page">
      <p className="player-detail-back">
        <Link to="/players">← Back to players</Link>
      </p>
      {detailQuery.isLoading ? <p className="status-copy">Loading player…</p> : null}
      {detailQuery.isError ? (
        <p className="status-copy" role="alert">
          Player details could not be loaded.
        </p>
      ) : null}
      {segmentErrors.length > 0 ? (
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
        <PlayerTile
          name={name}
          captain={false}
          variant="squad"
          showName={false}
          photoUrl={media?.photoUrl ?? ownSquadCard?.photoUrl ?? null}
          teamBadgeUrl={media?.teamBadgeUrl ?? ownSquadCard?.teamBadgeUrl ?? null}
        />
        <div className="player-detail-header-text">
          <h1>{name}</h1>
          <p>
            FSYP {points ?? MISSING_STAT} · {positionLabel(positionId)} ·{" "}
            <AvailabilityCell availability={availability} />
          </p>
          {injury?.availability_text || injury?.diagnosis ? (
            <p className="player-detail-availability-reason">
              {[text(injury.availability_text), text(injury.diagnosis)].filter(Boolean).join(" — ")}
            </p>
          ) : null}
        </div>
        <div className="player-detail-header-actions">
          {ownSquadCard ? (
            <SquadPlayerActions player={ownSquadCard} sales={squadSales}>
              <span className="player-detail-squad-hit">{name}</span>
            </SquadPlayerActions>
          ) : null}
          {showMarketMenu && marketRow ? (
            <MarketActionMenu row={marketRow} context={actionContext} actions={marketActions} />
          ) : null}
          {showBookmark ? (
            <PlayerBookmarkButton
              pressed={favorites.has(masterId)}
              playerName={name}
              onToggle={() => setFavorites(toggleFavoritePlayerId(userId, masterId))}
            />
          ) : null}
        </div>
      </header>

      <section className="player-detail-panel player-detail-section">
        <h2>Form — fixture stats</h2>
        <div className="player-detail-fixture-actions">
          {FIXTURE_LAST_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className={last === step ? "is-active" : undefined}
              onClick={() => setLast(step)}
            >
              Last {step}
            </button>
          ))}
          <button type="button" onClick={() => setShowAdvancedStats((value) => !value)}>
            {showAdvancedStats ? "Hide details" : "Details"}
          </button>
        </div>
        {fixturesBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : (
          <div className="player-detail-table-wrap">
            <table className="player-detail-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Fixture</th>
                  <th>Competition</th>
                  {showAdvancedStats
                    ? STAT_KEYS.map((key) => <th key={key}>{key.replace(/_/g, " ")}</th>)
                    : null}
                </tr>
              </thead>
              <tbody>
                {fixtureRows.map((row, index) => {
                  const record = asRecord(row);
                  const fixture = asRecord(record?.fixture);
                  const stats = asRecord(record?.stats);
                  return (
                    <tr key={index}>
                      <td>{text(fixture?.date) ?? MISSING_STAT}</td>
                      <td>{fixtureLabel(fixture)}</td>
                      <td>{text(fixture?.competition_label) ?? text(fixture?.competition) ?? MISSING_STAT}</td>
                      {showAdvancedStats
                        ? STAT_KEYS.map((key) => (
                            <td key={key}>{statCount(stats?.[key])}</td>
                          ))
                        : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="player-detail-panel player-detail-section">
        <h2>Market value</h2>
        <div className="player-detail-market-presets">
          {MARKET_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className={!marketUseCustomRange && marketPreset === value ? "is-active" : undefined}
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
            onClick={() => {
              setMarketUseCustomRange(true);
              setMarketCustomDraftFrom(marketCustomFrom);
              setMarketCustomDraftTo(marketCustomTo);
            }}
          >
            Custom
          </button>
        </div>
        {marketUseCustomRange ? (
          <form
            className="player-detail-market-custom"
            onSubmit={(event) => {
              event.preventDefault();
              if (!marketCustomDraftFrom || !marketCustomDraftTo) return;
              setMarketCustomFrom(marketCustomDraftFrom);
              setMarketCustomTo(marketCustomDraftTo);
            }}
          >
            <label>
              From
              <input
                type="date"
                value={marketCustomDraftFrom}
                onChange={(event) => setMarketCustomDraftFrom(event.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={marketCustomDraftTo}
                onChange={(event) => setMarketCustomDraftTo(event.target.value)}
              />
            </label>
            <button type="submit">Apply range</button>
          </form>
        ) : null}
        {marketBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : marketSeries.length === 0 ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : (
          <>
            <p className="player-detail-deltas">
              Absolute: {deltaAbs != null ? formatEuro(deltaAbs) : MISSING_STAT} · Relative:{" "}
              {deltaRelPercent(deltaRel) ?? MISSING_STAT}
            </p>
            <div className="player-detail-chart">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={marketSeries}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatChartAxisDate}
                    minTickGap={28}
                    tick={{ fill: "var(--ink)", fontSize: 11 }}
                  />
                  <YAxis
                    width={56}
                    domain={marketChartYDomain}
                    tickCount={5}
                    allowDecimals={false}
                    tickFormatter={formatMarketChartTick}
                    tick={{ fill: "var(--ink)", fontSize: 11 }}
                  />
                  <Tooltip
                    labelFormatter={(label) => formatChartAxisDate(String(label ?? ""))}
                    formatter={(value) => formatEuro(Number(value))}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--cyan)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="player-detail-panel player-detail-section">
        <h2>Matches</h2>
        <h3>Recent</h3>
        {recentBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : (
          <ul className="player-detail-match-list">
            {(Array.isArray(recentBlock.matches) ? recentBlock.matches : []).map((m, i) => {
              const match = asRecord(m);
              const fixture = asRecord(match?.fixture);
              return (
                <li key={i}>
                  {text(fixture?.date) ?? MISSING_STAT} · {fixtureLabel(fixture)} ·{" "}
                  {text(fixture?.competition_label) ?? MISSING_STAT}
                </li>
              );
            })}
          </ul>
        )}
        <h3>Upcoming (max 5)</h3>
        {upcomingBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : (
          <ul className="player-detail-match-list">
            {(Array.isArray(upcomingBlock.matches) ? upcomingBlock.matches : []).map((m, i) => {
              const match = asRecord(m);
              const fixture = asRecord(match?.fixture);
              const weather = asRecord(match?.weather);
              const snapshot = asRecord(weather?.snapshot);
              const travel = asRecord(match?.travel);
              const wind = windKmhFromMs(asFiniteNumber(snapshot?.wind_speed_ms));
              return (
                <li key={i}>
                  {text(fixture?.date) ?? MISSING_STAT} · {fixtureLabel(fixture)} ·{" "}
                  {fixture?.is_home === true ? "Home" : fixture?.is_home === false ? "Away" : MISSING_STAT}
                  {" · "}
                  {snapshot
                    ? `Temp ${asFiniteNumber(snapshot.temperature_c) ?? MISSING_STAT}°C`
                    : NO_DATA_YET}
                  {wind != null ? ` · Wind ${wind} km/h` : ""}
                  {" · "}
                  {asFiniteNumber(travel?.distance_km) != null
                    ? `${travel?.distance_km} km`
                    : NO_DATA_YET}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="player-detail-panel player-detail-section player-detail-fantasy">
        <h2>
          <img src={fantasyLogo} alt="" className="player-detail-fantasy-logo" />
          Fantasy data
        </h2>
        {profileBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : (
          <>
            <p className="player-detail-hierarchy">
              <span>{text(hierarchy?.label) ?? "Other"}</span>
              <img src={hierarchyIcon(text(hierarchy?.label))} alt="" aria-hidden />
            </p>
            <p className="player-detail-inline-icon">
              Starter {asFiniteNumber(startProb?.percent) ?? MISSING_STAT}%
              <img
                src={starterIcon(asFiniteNumber(startProb?.percent))}
                alt=""
                aria-hidden
              />
            </p>
            <p className="player-detail-inline-icon">
              Injury risk {text(injuryRisk?.raw) ?? text(injuryRisk?.level) ?? "Other"}
              <img src={injuryIcon(text(injuryRisk?.level))} alt="" aria-hidden />
            </p>
            <h3>News</h3>
            <ul className="player-detail-news-list">
              {news.map((item, index) => {
                const row = asRecord(item);
                const title = text(row?.title) ?? MISSING_STAT;
                const href = newsItemHref(row);
                const source = text(row?.source);
                return (
                  <li key={index}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {title}
                      </a>
                    ) : (
                      title
                    )}
                    {source ? (
                      <span className="player-detail-news-source"> ({source})</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <h3>Injury history</h3>
            <ul className="player-detail-injury-list">
              {injuryHistory.map((item, index) => {
                const row = asRecord(item);
                const entry = formatInjuryHistoryEntry(row);
                const meta = [entry.period, entry.duration].filter(Boolean).join(" · ");
                return (
                  <li key={index}>
                    <span className="player-detail-injury-diagnosis">{entry.diagnosis}</span>
                    {meta ? (
                      <span className="player-detail-injury-meta">{meta}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="player-detail-panel player-detail-section">
        <h2>Averages per match</h2>
        <p className="status-copy">Not available from the API yet.</p>
        <table className="player-detail-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Statistic</th>
              <th>Average</th>
            </tr>
          </thead>
          <tbody>
            {AVERAGE_PLACEHOLDER.map(([code, label]) => (
              <tr key={code}>
                <td>{code}</td>
                <td>{label}</td>
                <td>{MISSING_STAT}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <BidDialog
        open={marketActions.pendingBid != null}
        row={marketActions.pendingBid?.row ?? null}
        kind={marketActions.pendingBid?.kind ?? null}
        money={marketBoard.money}
        squadMarketValue={marketBoard.squadMarketValue}
        initialAmount={marketActions.pendingBid?.initialAmount ?? null}
        pending={marketActions.actionPending}
        error={marketActions.message}
        onClose={marketActions.closeBid}
        onConfirm={marketActions.submitBid}
      />
      <WithdrawDialog
        open={marketActions.pendingWithdraw != null}
        row={withdraw}
        pending={marketActions.actionPending}
        error={marketActions.message}
        onClose={marketActions.closeWithdraw}
        onConfirm={marketActions.confirmWithdraw}
      />
      <ClauseDialog
        open={marketActions.pendingClause != null}
        row={marketActions.pendingClause?.row ?? null}
        amount={marketActions.pendingClause?.amount ?? 0}
        pending={marketActions.actionPending}
        error={marketActions.message}
        onClose={marketActions.closeClause}
        onConfirm={marketActions.confirmClause}
      />
    </section>
  );
}
