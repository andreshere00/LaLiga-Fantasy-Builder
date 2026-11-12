import { t, useTranslation } from "../../i18n";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useLineupBuilder } from "./useLineupBuilder";
import { LINEUP_RECOMMENDATION_LIMIT, LineupBuilderResults } from "./LineupBuilderResults";
import type { BuilderCandidate, LineupBuildDto, LineupBuildProgress } from "../../api/schemas";
import { LineupBuilderPlayerActions } from "./LineupBuilderPlayerActions";
import { LineupBuilderSaleActions, type BuilderSaleAction } from "./LineupBuilderSaleActions";
import { useMarketBoard } from "../market/useMarketBoard";
import { getJson, paths } from "../../api/client";
import {
  leagueId,
  mediaFromPlayerMaster,
  playersOf,
  squadCards,
  text,
  type RankingEntry,
  type SquadCard,
} from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { usePlayersCatalogQuery } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Fields";
import { Progress, ProgressLabel } from "../../components/ui/Progress";
import { DEFAULT_LINEUPS_AVAILABLE } from "./formations";
import { useLeague } from "./LeagueProvider";
import { catalogById, marketItems, masterIdOf, masterOf } from "../market/model/listing";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { PersonIcon } from "../shell/icons";
import "./LineupBuilderDialog.css";

type PlayerOption = {
  id: string;
  name: string;
  source: string;
  sourceKind: "owned" | "market" | "opponents";
  sourceKey?: string;
  photoUrl: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  ranking: RankingEntry[];
  squad: SquadCard[];
  selectedTeamId: string | null;
  formations: { value: string; label: string }[];
  canApply: (candidate: BuilderCandidate, targetWeek: number) => boolean;
  onApply: (candidate: BuilderCandidate, targetWeek: number) => void;
  isDraftDirty: (targetWeek: number) => boolean;
};

const EMPTY: PlayerOption[] = [];
const EMPTY_SQUAD: SquadCard[] = [];

function progressLabel(progress: LineupBuildProgress | null): string {
  if (!progress) return t("Building recommendations…");
  switch (progress.stage) {
    case "players":
      return t("Evaluating players: {{0}}/{{1}}", { 0: progress.completedPlayers, 1: progress.totalPlayers });
    case "trades":
      return t("Checking trade options…");
    case "search":
      return t("Finding the best lineups…");
    case "explanation":
      return t("Writing explanations…");
    case "complete":
      return t("Recommendations ready");
    case "sources":
      return t("Building recommendations…");
    default:
      return assertNever(progress.stage);
  }
}

function assertNever(value: never): never {
  throw new Error(t("Unsupported lineup build progress stage: {{0}}", { 0: value }));
}

function squadOptions(
  players: readonly SquadCard[], source: string,
  sourceKind: PlayerOption["sourceKind"], sourceKey?: string,
): PlayerOption[] {
  return players.flatMap((player) => player.masterPlayerId ? [{
    id: player.masterPlayerId, name: player.name, source, sourceKind, sourceKey, photoUrl: player.photoUrl,
  }] : []);
}

export function LineupBuilderDialog(props: Props) {
  const { user } = useAuth();
  const { selected } = useLeague();
  return props.open && user && selected ? <BuilderDialogSession key={`${user.userId}:${leagueId(selected)}`} {...props} /> : null;
}

function BuilderDialogSession({
  open, onClose, ranking, squad, selectedTeamId, formations, canApply, onApply, isDraftDirty,
}: Props) {
  useTranslation();
  const { accessToken, user } = useAuth();
  const { selected } = useLeague();
  const id = selected ? leagueId(selected) : "";
  const token = accessToken ?? "";
  const [replacement, setReplacement] = useState<{
    candidate: BuilderCandidate; build: LineupBuildDto;
  } | null>(null);
  const [acquiring, setAcquiring] = useState<BuilderCandidate["starters"][number] | null>(null);
  const [changedResult, setChangedResult] = useState<LineupBuildDto | null>(null);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [allowBuying, setAllowBuying] = useState(true);
  const [allowSelling, setAllowSelling] = useState(true);
  const [includeTradingPurchases, setIncludeTradingPurchases] = useState(false);
  const [requireNonnegativeCash, setRequireNonnegativeCash] = useState(false);
  const [allowImmediateSale, setAllowImmediateSale] = useState(false);
  const [bidStrategy, setBidStrategy] = useState<"market_value" | "max_profitable">("market_value");
  const [minBidReturnPercent, setMinBidReturnPercent] = useState("");
  const [saleAction, setSaleAction] = useState<BuilderSaleAction | null>(null);
  const [confirmedSales, setConfirmedSales] = useState<ReadonlySet<string>>(new Set());
  const board = useMarketBoard();
  // Refreshed cash minus pending bids: the same conservative bound the builder plans with.
  const availableCash = board.projection.available;
  const catalogQuery = usePlayersCatalogQuery(open);
  const [scope, setScope] = useState<string[]>(["owned"]);
  const [lineupPreferences, setLineupPreferences] = useState<string[]>([]);
  const ownTeamId = selected?.team?.id == null ? "" : String(selected.team.id);
  const ownTeamQuery = useQuery({
    queryKey: ["builder-own-roster", user?.userId, id, ownTeamId],
    enabled: open && id.length > 0 && ownTeamId.length > 0 && token.length > 0 &&
      selectedTeamId !== ownTeamId,
    queryFn: ({ signal }) => getJson(paths.team(id, ownTeamId), token, { signal }),
  });
  const ownSquad = selectedTeamId === ownTeamId
    ? squad
    : ownTeamQuery.data
      ? squadCards(playersOf(ownTeamQuery.data), null)
      : EMPTY_SQUAD;
  const opponents = ranking.filter((team) => team.selectable && team.teamId !== ownTeamId);
  const rosterQueries = useQueries({
    queries: opponents.map((team) => ({
      queryKey: ["builder-roster", user?.userId, id, team.teamId],
      enabled: open && scope.includes("opponents") && id.length > 0 && token.length > 0,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.team(id, team.teamId), token, { signal }),
    })),
  });
  const marketQuery = useQueries({
    queries: [{
      queryKey: ["builder-market", user?.userId, id],
      enabled: open && scope.includes("market") && id.length > 0 && token.length > 0,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.market(id), token, { signal }),
    }],
  })[0];

  const opponentOptions = useMemo(() => rosterQueries.flatMap((query, index) => {
    if (!query.data) return EMPTY;
    const team = opponents[index];
    return squadOptions(squadCards(playersOf(query.data), null), team?.name ?? "Opponent", "opponents", team?.name ? undefined : "Opponent");
  }), [opponents, rosterQueries]);
  const marketOptions = useMemo(() => marketItems(marketQuery?.data).flatMap((item) => {
    const master = masterOf(item);
    const playerId = masterIdOf(item);
    const name = text(master?.nickname) ?? text(master?.name);
    return playerId && name ? [{ id: playerId, name, source: "Market", sourceKind: "market" as const, sourceKey: "Market", photoUrl: mediaFromPlayerMaster(master).photoUrl }] : [];
  }), [marketQuery?.data]);
  const allOptions = useMemo(() => [
    ...squadOptions(ownSquad, "My squad", "owned", "My squad"),
    ...opponentOptions,
    ...marketOptions,
  ], [marketOptions, opponentOptions, ownSquad]);
  const playersById = useMemo(() => {
    const players = new Map<string, { name: string; photoUrl: string | null }>();
    for (const [playerId, player] of catalogById(catalogQuery.data)) {
      players.set(playerId, {
        name: text(player.nickname) ?? text(player.name) ?? "Unknown player",
        photoUrl: mediaFromPlayerMaster(player).photoUrl,
      });
    }
    for (const option of allOptions) {
      players.set(option.id, {
        name: option.name,
        photoUrl: option.photoUrl ?? players.get(option.id)?.photoUrl ?? null,
      });
    }
    return players;
  }, [allOptions, catalogQuery.data]);
  const builder = useLineupBuilder(id, token, playersById);
  const builtRequireNonnegative = builder.resultRequest?.requireNonnegativeCash === true;
  const scopeOptions = [...new Map(allOptions.filter((option) =>
    scope.includes(option.sourceKind))
    .map((option) => [option.id, option])).values()];
  const formationOptions = useMemo(() => {
    const premiumFormations = new Set<string>(DEFAULT_LINEUPS_AVAILABLE.premium);
    const defaults = DEFAULT_LINEUPS_AVAILABLE.free
      .map((value) => ({ value, label: value.replaceAll(",", "-") }));
    const entitled = selected?.config?.premiumFeatures?.formations === true;
    const freeFormations = formations.filter((item) => entitled || !premiumFormations.has(item.value));
    return [...new Map([...defaults, ...(entitled ? DEFAULT_LINEUPS_AVAILABLE.premium.map((value) => ({ value, label: value.replaceAll(",", "-") })) : []), ...freeFormations]
      .map((item) => [item.value, item])).values()];
  }, [formations, selected]);

  const filteredOptions = scopeOptions.filter((option) =>
    option.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    !chosen.includes(option.id),
  );
  const chosenOptions = chosen.flatMap((playerId) => {
    const option = allOptions.find((player) => player.id === playerId);
    return option ? [option] : [];
  });

  const parsedReturn = minBidReturnPercent.trim() === "" ? undefined : Number(minBidReturnPercent) / 100;
  const minBidReturn = parsedReturn !== undefined && Number.isFinite(parsedReturn)
    && parsedReturn >= 0 && parsedReturn <= 1 ? parsedReturn : undefined;
  const invalidReturn = bidStrategy === "max_profitable" && minBidReturnPercent.trim() !== "" && minBidReturn === undefined;

  /** Local draft gate: refreshed ownership, editable round and, when required, cash >= 0. */
  function draftable(candidate: BuilderCandidate, build: LineupBuildDto): boolean {
    return changedResult !== build && !builder.pending && !builder.error
      && canApply(candidate, build.target.week)
      && (!builtRequireNonnegative || (availableCash != null && availableCash >= 0));
  }

  function toggleChoice(value: string) {
    setScope((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  function toggleFormation(value: string) {
    setLineupPreferences((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("Build lineup")} className="lineup-builder-dialog"
      description={t("Choose your player pool, then fine-tune your starting XI.")}
      footer={<>
        <Button shape="square" variant="secondary" className="lineup-builder-close" onClick={onClose}>{t("Close")}</Button>
        {builder.pending && <div className="lineup-builder-loading" role="status">
          <span className="lineup-builder-bounce" aria-hidden="true">
            <span className="lineup-builder-bounce-ball" />
            <span className="lineup-builder-bounce-ground" />
          </span>
          <Progress value={builder.progress?.percent ?? null} className="lineup-builder-loading-details"
            aria-valuetext={builder.progress ? t("Estimated progress: {{0}}%", { 0: builder.progress.percent }) : undefined}>
            <ProgressLabel className="lineup-builder-loading-text">
              {progressLabel(builder.progress)}
              {builder.progress && <span className="lineup-builder-loading-percent"
                title={t("Estimated overall progress")}>
                {builder.progress.percent}%
              </span>}
            </ProgressLabel>
          </Progress>
        </div>}
        {builder.pending ? <Button shape="square" variant="destructive" onClick={builder.cancel}>{t("Cancel build")}</Button> : <Button shape="square"
          disabled={scope.length === 0 || !token || invalidReturn} onClick={() => {
            setReplacement(null);
            void builder.build({
              sources: scope as ("owned" | "market" | "opponents")[], mandatoryPlayerIds: chosen,
              formations: lineupPreferences, allowBuying, allowSelling,
              includeTradingPurchases: allowBuying && includeTradingPurchases,
              requireNonnegativeCash: allowSelling && requireNonnegativeCash,
              allowImmediateSale: allowSelling && allowImmediateSale,
              bidStrategy,
              ...(bidStrategy === "max_profitable" && minBidReturn !== undefined ? { minBidReturn } : {}),
              maxCandidates: LINEUP_RECOMMENDATION_LIMIT, explanation: { enabled: false },
            });
          }}>{t("Build")}</Button>}
      </>}>
      <div className="lineup-builder">
        <section className="lineup-builder-section lineup-builder-pool" aria-labelledby="builder-scope-title">
          <div className="lineup-builder-section-heading">
            <h3 id="builder-scope-title">{t("Player pool")}</h3>
            <span>{t("Choose at least one source")}</span>
          </div>
          <fieldset className="lineup-builder-checks" aria-labelledby="builder-scope-title">
            {[
              ["owned", "My squad", "Players you already own", "Consider owned players"],
              ["market", "Market", "Players listed for sale", "Consider players on the market"],
              ["opponents", "Opponents", "Players from rival squads", "Consider opponent players"],
            ].map(([value, label, hint, accessibleLabel]) => (
              <label key={value} className="lineup-builder-source" data-selected={scope.includes(value)}>
                <input type="checkbox" aria-label={t("{{0}}: {{1}}", { 0: t(label), 1: t(accessibleLabel) })} checked={scope.includes(value)}
                  onChange={() => toggleChoice(value)} />
                <span><strong>{t(label)}</strong><small>{t(hint)}</small></span>
              </label>
            ))}
          </fieldset>
          {scope.length === 0 && <p role="status" className="lineup-builder-scope-hint">{t("Select a player source to enable Build.")}</p>}
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-purchases-title">
          <div className="lineup-builder-section-heading">
            <h3 id="builder-purchases-title">{t("Purchases")}</h3>
            <span>{t("Market and rival players")}</span>
          </div>
          <label className="lineup-builder-master-option"><input type="checkbox" checked={allowBuying}
            onChange={(e) => setAllowBuying(e.target.checked)} /> {t(" Allow purchase recommendations")}</label>
          {!allowBuying && scope.some((source) => source !== "owned") && <p role="status" className="lineup-builder-scope-hint">
            {t("Enable purchase recommendations to include market or opponent players in proposed lineups.")}</p>}
          <fieldset className="lineup-builder-dependent" disabled={!allowBuying} aria-label={t("Purchase options")}>
            {!allowBuying && <p className="lineup-builder-dependent-hint">{t("Available when purchase recommendations are allowed.")}</p>}
            <div className="lineup-builder-option">
              <label><input type="checkbox" checked={allowBuying && includeTradingPurchases} disabled={!allowBuying}
                onChange={(e) => setIncludeTradingPurchases(e.target.checked)} /> {t(" Include trading-only purchases")}</label>
              <p className="lineup-builder-section-help">{t("Also buys players who will not start, to resell them at a profit.")}</p>
            </div>
            <div className="lineup-builder-bid" role="radiogroup" aria-labelledby="builder-bid-title">
              <span id="builder-bid-title" className="lineup-builder-subheading">{t("Bid amount")}</span>
              <div className="lineup-builder-choices">
                {([
                  ["market_value", "Market value", "Bids the market value, plus 1 € when other managers have already bid."],
                  ["max_profitable", "Maximum profitable bid", "Bids up to the value its recent rise suggests you can recover. Without enough history it bids the market value."],
                ] as const).map(([value, label, hint]) => (
                  <label key={value} className="lineup-builder-choice" data-selected={bidStrategy === value}>
                    <input type="radio" name="builder-bid-strategy" value={value} checked={bidStrategy === value} disabled={!allowBuying}
                      onChange={() => setBidStrategy(value)} />
                    <span><strong>{t(label)}</strong><small>{t(hint)}</small></span>
                  </label>
                ))}
              </div>
              {bidStrategy === "max_profitable" && <label className="lineup-builder-field lineup-builder-return">
                <span>{t("Minimum return (%)")}</span>
                <span className="lineup-builder-return-input">
                  <Input inputMode="decimal" value={minBidReturnPercent} placeholder="0" aria-label={t("Minimum return (%)")}
                    aria-invalid={invalidReturn} aria-describedby="builder-return-help" disabled={!allowBuying}
                    onChange={(e) => setMinBidReturnPercent(e.target.value)} />
                  <span aria-hidden="true">%</span>
                </span>
                <small id="builder-return-help">{t("Players whose maximum profitable bid returns less than this are not bid on.")}</small>
                {invalidReturn && <small role="alert" className="lineup-builder-field-error">{t("Enter a percentage between 0 and 100.")}</small>}
              </label>}
            </div>
          </fieldset>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-sales-title">
          <div className="lineup-builder-section-heading">
            <h3 id="builder-sales-title">{t("Sales")}</h3>
            <span>{t("Your own players")}</span>
          </div>
          <label className="lineup-builder-master-option"><input type="checkbox" checked={allowSelling}
            onChange={(e) => setAllowSelling(e.target.checked)} /> {t(" Allow sale recommendations")}</label>
          <fieldset className="lineup-builder-dependent" disabled={!allowSelling} aria-label={t("Sale options")}>
            {!allowSelling && <p className="lineup-builder-dependent-hint">{t("Available when sale recommendations are allowed.")}</p>}
            <div className="lineup-builder-option" data-tone="warning">
              <label><input type="checkbox" checked={allowSelling && allowImmediateSale} disabled={!allowSelling}
                onChange={(e) => setAllowImmediateSale(e.target.checked)} /> {t(" Allow immediate sales (half market value)")}</label>
              <p className="lineup-builder-section-help">{t("Only used for the shortfall that offers on your players cannot cover. You lose half of each player's market value.")}</p>
            </div>
          </fieldset>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-balance-title">
          <div className="lineup-builder-section-heading">
            <h3 id="builder-balance-title">{t("Balance")}</h3>
            <span>{t("Cash at kickoff")}</span>
          </div>
          <div className="lineup-builder-option">
            <label><input type="checkbox" checked={allowSelling && requireNonnegativeCash} disabled={!allowSelling}
              onChange={(e) => setRequireNonnegativeCash(e.target.checked)} /> {t(" Non-negative balance at kickoff")}</label>
            <p className="lineup-builder-section-help">{t("Plans may otherwise end with debt, down to 20% of your squad value. With this option every plan includes the sales needed to reach a balance of 0 or more.")}</p>
            {!allowSelling && <p className="lineup-builder-dependent-hint">{t("Needs sale recommendations to reach a balance of 0 or more.")}</p>}
          </div>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-player-title">
          <div className="lineup-builder-section-heading"><h3 id="builder-player-title">{t("Mandatory players")}</h3><span>{t("{{0}} / 11 selected", { 0: chosen.length })}</span></div>
          <p className="lineup-builder-section-help">{t("Lock players into the starting XI. Leave empty for the best available combination.")}</p>
          <details className="lineup-builder-locks">
            <summary>{t("Choose mandatory players")}</summary>
            <div className="lineup-builder-player-picker">
              <div className="lineup-builder-player-search">
                <label className="lineup-builder-field">
                  <span>{t("Search available players")}</span>
                  <span className="fb-input-group">
                    <Input value={search} onChange={(event) => setSearch(event.target.value)}
                      placeholder={t("Search players")} aria-label={t("Search available players")} />
                  </span>
                </label>
                <div className="lineup-builder-options" aria-label={t("Available players")}>
                  {filteredOptions.map((option) => (
                    <button type="button" key={option.id}
                      disabled={chosen.length >= 11} onClick={() => setChosen((current) => [...current, option.id])}>
                      <ProfilePhoto key={playersById.get(option.id)?.photoUrl ?? "no-photo"}
                        className="lineup-builder-option-photo" url={playersById.get(option.id)?.photoUrl ?? null}
                        fallback={<PersonIcon />} />
                      <span>{option.name}</span><small>{option.sourceKey ? t(option.sourceKey) : option.source}</small>
                    </button>
                  ))}
                  {filteredOptions.length === 0 ? <p className="fb-helper">
                    {open && (ownTeamQuery.isLoading || marketQuery?.isLoading ||
                      rosterQueries.some((query) => query.isLoading)) ? t("Loading available players…") : ownTeamQuery.isError || marketQuery?.isError || rosterQueries.some((query) => query.isError) ? t("Some player sources could not be loaded.") : t("No players found.")}
                  </p> : null}
                </div>
              </div>
              <div className="lineup-builder-chosen">
                <h4>{t("Starting XI locks")}</h4>
                {chosenOptions.length ? chosenOptions.map((option) => (
                  <button type="button" key={option.id} aria-label={t("Remove {{0}}", { 0: option.name })} onClick={() => setChosen((current) =>
                    current.filter((id) => id !== option.id))}>
                    <ProfilePhoto key={playersById.get(option.id)?.photoUrl ?? "no-photo"}
                      className="lineup-builder-option-photo" url={playersById.get(option.id)?.photoUrl ?? null}
                      fallback={<PersonIcon />} />
                    {option.name} <span aria-hidden="true">×</span>
                  </button>
                )) : <p className="fb-helper">{t("No players locked. Add a player from the list.")}</p>}
              </div>
            </div>
          </details>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-formations-title">
          <div className="lineup-builder-section-heading"><h3 id="builder-formations-title">{t("Formations")}</h3><span>{lineupPreferences.length ? t(lineupPreferences.length === 1 ? "{{0}} formation selected" : "{{0}} formations selected", { 0: lineupPreferences.length }) : t("All supported")}</span></div>
          <p className="lineup-builder-section-help">{t("Choose preferred formations, or leave empty to consider all.")}</p>
          <div className="lineup-builder-formations" aria-label={t("Available formations")}>
            {formationOptions.map((formation) => (
              <label key={formation.value}>
                <input type="checkbox" checked={lineupPreferences.includes(formation.value)}
                  onChange={() => toggleFormation(formation.value)} />{formation.label}
              </label>
            ))}
          </div>
        </section>

        <p className="lineup-builder-preview-note">{t("Preview only. Building never buys, sells or saves players.")}</p>

        {builder.error && <div className="lineup-builder-error" role="alert">
          <h3>{t("Could not build a lineup")}</h3>
          <p>{builder.errorSummary}</p>
          {builder.errorDetails.length > 0 && <ul>{builder.errorDetails.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
          {builder.errorRecovery && <p className="lineup-builder-error-recovery">{t(builder.errorRecovery)}</p>}
          {builder.result && <p>{t("Previous results are stale. Rebuild before applying a draft.")}</p>}
        </div>}
        {builder.result && changedResult === builder.result && <p role="status">{t("Your acquisition activity changed. Rebuild the recommendations before using a draft.")}</p>}
        {builder.result && <LineupBuilderResults key={builder.result.buildId} result={builder.result} playersById={playersById}
          ownedPlayerIds={new Set(ownSquad.flatMap((player) => player.masterPlayerId ? [player.masterPlayerId] : []))}
          onAcquire={setAcquiring}
          requireNonnegativeCash={builtRequireNonnegative} availableCash={availableCash}
          confirmedSales={confirmedSales} onSaleAction={setSaleAction}
          canApply={(candidate) => draftable(candidate, builder.result!)}
          onApply={(candidate) => {
            if (isDraftDirty(builder.result!.target.week)) setReplacement({ candidate, build: builder.result! });
            else onApply(candidate, builder.result!.target.week);
          }} />}
        {acquiring && builder.result && <LineupBuilderPlayerActions key={acquiring.playerId}
          player={acquiring} opponentTeamIds={opponents.map((team) => team.teamId)}
          clausesDeadline={builder.result.target.clausesDeadline} onClose={() => setAcquiring(null)}
          onSuccess={() => { builder.cancel(); setChangedResult(builder.result); }} />}
        {saleAction && <LineupBuilderSaleActions key={`${saleAction.kind}-${saleAction.playerId}`}
          action={saleAction} squad={ownSquad} onClose={() => setSaleAction(null)}
          onDone={(done) => setConfirmedSales((current) => new Set([...current, `${done.kind}:${done.playerId}`]))} />}
        {replacement && replacement.build === builder.result && <section aria-label={t("Replace draft confirmation")}>
          <p>{t("Replace your unsaved lineup draft?")}</p>
          <Button shape="square" onClick={() => {
            const { candidate, build } = replacement;
            if (draftable(candidate, build)) onApply(candidate, build.target.week);
            setReplacement(null);
          }}>{t("Replace draft")}</Button>
          <Button shape="square" variant="secondary" onClick={() => setReplacement(null)}>{t("Keep my draft")}</Button>
        </section>}
      </div>
    </Dialog>
  );
}
