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
  teamNameFromPlayerMaster,
  text,
} from "../../api/mappers";
import { usePlayerStatsDetailQuery, usePlayersCatalogQuery } from "../../api/queries";
import { useNow } from "../../hooks/useNow";
import { useRetained } from "../../hooks/useRetained";
import { parseMasterPlayerId, type MasterPlayerId } from "../../api/ids";
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
import { useLeague } from "../lineup/LeagueProvider";
import { SquadPlayerActions } from "../lineup/SquadPlayerActions";
import { useSquadSales } from "../lineup/useSquadSales";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import { PlayerMatchesSection } from "./PlayerMatchesSection";
import { PlayerFantasySection } from "./PlayerFantasySection";
import "./PlayerDetailPage.css";

const FIXTURE_LAST_STEPS = [5, 10, 20, 40, 60] as const;
const MARKET_PRESETS = ["season", "30d", "14d", "10d", "5d"] as const;

const STAT_LABELS: Record<string, string> = {
  minutes_played: "Minutes",
  goals: "Goals",
  assists: "Assists",
  big_chances_created: "Big chances",
  balls_into_box: "Balls into box",
  penalties_won: "Penalties won",
  penalties_committed: "Penalties committed",
  penalties_saved: "Penalties saved",
  saves: "Saves",
  clearances: "Clearances",
  penalties_missed: "Penalties missed",
  own_goals: "Own goals",
  goals_conceded: "Goals conceded",
  yellow_cards: "Yellow cards",
  red_card: "Red card",
  shots: "Shots",
  successful_dribbles: "Dribbles",
  recoveries: "Recoveries",
  balls_lost: "Balls lost",
  dazn_points: "DAZN",
};

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

function fixtureLabel(fixture: Record<string, unknown> | null): string {
  if (!fixture) return MISSING_STAT;
  const home = clubDisplayName(text(fixture.home_team));
  const away = clubDisplayName(text(fixture.away_team));
  if (home && away) return `${home} vs ${away}`;
  const opponent = clubDisplayName(text(fixture.opponent));
  if (opponent) return opponent;
  return MISSING_STAT;
}

function isoDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function entryKey(parts: readonly (string | null | undefined)[], index: number): string {
  const label = parts.filter((part): part is string => part != null && part.length > 0).join("|");
  return label.length > 0 ? `${label}|${index}` : `row-${index}`;
}

function fixtureKey(fixture: Record<string, unknown> | null, index: number): string {
  return entryKey(
    [
      text(fixture?.date),
      text(fixture?.home_team),
      text(fixture?.away_team),
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
  const { user, accessToken } = useAuth();
  const userId = user?.user_id ?? null;
  const [last, setLast] = useState(5);
  const [marketPreset, setMarketPreset] = useState<string>("season");
  const [marketCustomFrom, setMarketCustomFrom] = useState("");
  const [marketCustomTo, setMarketCustomTo] = useState("");
  const [marketCustomDraftFrom, setMarketCustomDraftFrom] = useState("");
  const [marketCustomDraftTo, setMarketCustomDraftTo] = useState("");
  const [marketUseCustomRange, setMarketUseCustomRange] = useState(false);
  const [lastDays, setLastDays] = useState("21");
  const [favorites, setFavorites] = useState(() => readFavoritePlayerIds(userId));
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  const detailQueryInput = useMemo((): PlayerStatsDetailQuery => {
    const base: PlayerStatsDetailQuery = {
      last,
      limit: 5,
      include_weather: true,
      include_stats: true,
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
  const now = useNow();
  const marketListing = usePlayerMarketListing(masterId);
  const marketActions = useMarketActions();
  const squadSales = useSquadSales();
  const withdraw = useRetained(marketActions.pendingWithdraw);
  const teamQuery = useQuery({
    queryKey: ["team", leagueKey, teamId],
    enabled: signedIn && leagueKey !== "" && teamId != null,
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
  const detailReady = detail != null;
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
  const teamName =
    text(asRecord(detail?.player)?.team_name) ??
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

  const deltaAbs = asFiniteNumber(asRecord(marketBlock?.window)?.delta_abs);
  const deltaRel = asFiniteNumber(asRecord(marketBlock?.window)?.delta_rel);
  const currentValue = asFiniteNumber(marketBlock?.current_value);
  const changeTone = marketChangeTone(deltaRel);
  const averages = Array.isArray(profileBlock?.averages) ? profileBlock.averages : [];

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
  const showBookmark = !showMarketMenu && ownSquadCard == null;
  const rangeInvalid =
    marketCustomDraftFrom !== "" &&
    marketCustomDraftTo !== "" &&
    marketCustomDraftFrom > marketCustomDraftTo;
  const canApplyRange =
    marketCustomDraftFrom !== "" && marketCustomDraftTo !== "" && !rangeInvalid;

  return (
    <section className="player-detail-page">
      <p className="player-detail-back">
        <Link to="/players">← Back to players</Link>
      </p>
      {!detailReady && !detailQuery.isError ? (
        <p className="status-copy">Loading player…</p>
      ) : null}
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
            {teamName ?? MISSING_STAT} · FSYP {points ?? MISSING_STAT} · {positionLabel(positionId)} ·{" "}
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
              aria-pressed={last === step}
              onClick={() => setLast(step)}
            >
              Last {step}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={showAdvancedStats}
            onClick={() => setShowAdvancedStats((value) => !value)}
          >
            {showAdvancedStats ? "Hide details" : "Details"}
          </button>
        </div>
        {!detailReady ? null : fixturesBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : (
          <div className="player-detail-table-wrap">
            <table className="player-detail-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Fixture</th>
                  <th>Competition</th>
                  <th>Minutes</th>
                  <th>Points</th>
                  {showAdvancedStats
                    ? STAT_KEYS.map((key) => <th key={key}>{STAT_LABELS[key] ?? key}</th>)
                    : null}
                </tr>
              </thead>
              <tbody>
                {fixtureRows.map((row, index) => {
                  const record = asRecord(row);
                  const fixture = asRecord(record?.fixture);
                  const stats = asRecord(record?.stats);
                  const total = asFiniteNumber(record?.fantasy_points_total);
                  return (
                    <tr key={fixtureKey(fixture, index)}>
                      <td>{fixtureDateLabel(fixture)}</td>
                      <td>{fixtureLabel(fixture)}</td>
                      <td>{text(fixture?.competition_label) ?? text(fixture?.competition) ?? MISSING_STAT}</td>
                      <td>{asFiniteNumber(record?.minutes_played) ?? MISSING_STAT}</td>
                      <td>{total ?? MISSING_STAT}</td>
                      {showAdvancedStats
                        ? STAT_KEYS.map((key) => (
                            <td key={key}>{statDisplay(stats?.[key], key)}</td>
                          ))
                        : null}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4}>Total</th>
                  <td>
                    {fixtureRows.reduce((sum, row) => {
                      const total = asFiniteNumber(asRecord(row)?.fantasy_points_total);
                      return sum + (total ?? 0);
                    }, 0)}
                  </td>
                  {showAdvancedStats ? <td colSpan={STAT_KEYS.length} /> : null}
                </tr>
              </tfoot>
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
              if (!canApplyRange) return;
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
            <label>
              Last days
              <input
                type="number"
                min={1}
                max={400}
                value={lastDays}
                onChange={(event) => setLastDays(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const days = Number(lastDays);
                if (!Number.isInteger(days) || days < 1) return;
                const to = new Date();
                const from = new Date();
                from.setDate(to.getDate() - days);
                const fromIso = isoDate(from);
                const toIso = isoDate(to);
                setMarketCustomDraftFrom(fromIso);
                setMarketCustomDraftTo(toIso);
                setMarketCustomFrom(fromIso);
                setMarketCustomTo(toIso);
              }}
            >
              Apply last days
            </button>
            <button type="submit" disabled={!canApplyRange}>
              Apply range
            </button>
            {rangeInvalid ? (
              <p className="status-copy" role="alert">
                From must be on or before to.
              </p>
            ) : null}
          </form>
        ) : null}
        {!detailReady ? null : marketBlock == null ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : marketSeries.length === 0 ? (
          <p className="status-copy">{NO_DATA_YET}</p>
        ) : (
          <>
            <p className="player-detail-deltas">
              <strong>{currentValue != null ? formatEuro(currentValue) : MISSING_STAT}</strong>
              {" · "}
              <span className={changeTone}>
                {deltaAbs != null ? formatEuro(deltaAbs) : MISSING_STAT}
              </span>
              {" · "}
              <span className={changeTone}>{deltaRelPercent(deltaRel) ?? MISSING_STAT}</span>
            </p>
            <div className="player-detail-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={marketSeries}
                  margin={{ top: 12, right: 16, left: 8, bottom: 20 }}
                >
                  <CartesianGrid
                    stroke="#ffffff"
                    strokeDasharray="0 6"
                    strokeOpacity={0.5}
                    strokeWidth={2}
                    strokeLinecap="round"
                    vertical
                    horizontal
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatChartAxisDate}
                    minTickGap={28}
                    stroke="#ffffff"
                    tick={{ fill: "#ffffff", fontSize: 11 }}
                    label={{ value: "Date", position: "insideBottom", offset: -8, fill: "#ffffff" }}
                  />
                  <YAxis
                    width={64}
                    domain={marketChartYDomain}
                    tickCount={5}
                    allowDecimals={false}
                    tickFormatter={formatMarketChartTick}
                    stroke="#ffffff"
                    tick={{ fill: "#ffffff", fontSize: 11 }}
                    label={{
                      value: "Market value",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#ffffff",
                    }}
                  />
                  <Tooltip
                    labelFormatter={(label) => formatChartAxisDate(String(label ?? ""))}
                    formatter={(value, name) => [
                      formatEuro(Number(value)),
                      name === "trend" ? "Tendency" : "Value",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    name="trend"
                    stroke="#FFC2BF"
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="value"
                    stroke="#FF4B44"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                    style={{ filter: "drop-shadow(0 0 4px #FF4B44)" }}
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


      {detailReady ? (
      <>
      <PlayerFantasySection profile={profileBlock} />

      <section className="player-detail-panel player-detail-section player-detail-averages">
        <h2>Averages per match</h2>
        {averages.length === 0 ? (
          <p className="status-copy">Not available from the API yet.</p>
        ) : (
          <div className="player-detail-table-wrap">
            <table className="player-detail-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Statistic</th>
                  <th>Average</th>
                </tr>
              </thead>
              <tbody>
                {averages.map((item, index) => {
                  const row = asRecord(item);
                  const value = asFiniteNumber(row?.value);
                  return (
                    <tr key={text(row?.code) ?? String(index)}>
                      <td>{text(row?.code) ?? MISSING_STAT}</td>
                      <td>{text(row?.label) ?? MISSING_STAT}</td>
                      <td>{value != null ? value.toFixed(2) : MISSING_STAT}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      ) : null}

      <BidDialog
        open={marketActions.pendingBid != null}
        row={marketActions.pendingBid?.row ?? null}
        kind={marketActions.pendingBid?.kind ?? null}
        money={marketListing.money}
        squadMarketValue={marketListing.squadMarketValue}
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
  return <PlayerDetailBody key={user?.user_id ?? ""} masterId={masterId} />;
}
