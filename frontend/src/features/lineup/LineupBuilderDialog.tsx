import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useLineupBuilder } from "./useLineupBuilder";
import { LINEUP_RECOMMENDATION_LIMIT, LineupBuilderResults } from "./LineupBuilderResults";
import type { BuilderCandidate, LineupBuildDto, LineupBuildProgress } from "../../api/schemas";
import { LineupBuilderPlayerActions } from "./LineupBuilderPlayerActions";
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

type PlayerOption = { id: string; name: string; source: string; photoUrl: string | null };

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
  if (!progress) return "Building recommendations…";
  switch (progress.stage) {
    case "players":
      return `Evaluating players: ${progress.completedPlayers}/${progress.totalPlayers}`;
    case "trades":
      return "Checking trade options…";
    case "search":
      return "Finding the best lineups…";
    case "explanation":
      return "Writing explanations…";
    case "complete":
      return "Recommendations ready";
    case "sources":
      return "Building recommendations…";
    default:
      return assertNever(progress.stage);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported lineup build progress stage: ${value}`);
}

function squadOptions(players: readonly SquadCard[], source: string): PlayerOption[] {
  return players.flatMap((player) => player.masterPlayerId ? [{
    id: player.masterPlayerId, name: player.name, source, photoUrl: player.photoUrl,
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
  const [allowBuying, setAllowBuying] = useState(false);
  const [allowSelling, setAllowSelling] = useState(false);
  const [includeTradingPurchases, setIncludeTradingPurchases] = useState(false);
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
    return squadOptions(squadCards(playersOf(query.data), null), team?.name ?? "Opponent");
  }), [opponents, rosterQueries]);
  const marketOptions = useMemo(() => marketItems(marketQuery?.data).flatMap((item) => {
    const master = masterOf(item);
    const playerId = masterIdOf(item);
    const name = text(master?.nickname) ?? text(master?.name);
    return playerId && name ? [{ id: playerId, name, source: "Market", photoUrl: mediaFromPlayerMaster(master).photoUrl }] : [];
  }), [marketQuery?.data]);
  const allOptions = useMemo(() => [
    ...squadOptions(ownSquad, "My squad"),
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
  const scopeOptions = [...new Map(allOptions.filter((option) =>
    scope.includes(option.source === "My squad" ? "owned" : option.source === "Market" ? "market" : "opponents"))
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
    <Dialog open={open} onClose={onClose} title="Build lineup" className="lineup-builder-dialog"
      description="Choose your player pool, then fine-tune your starting XI."
      footer={<>
        <Button shape="square" variant="secondary" className="lineup-builder-close" onClick={onClose}>Close</Button>
        {builder.pending && <div className="lineup-builder-loading" role="status">
          <span className="lineup-builder-bounce" aria-hidden="true">
            <span className="lineup-builder-bounce-ball" />
            <span className="lineup-builder-bounce-ground" />
          </span>
          <Progress value={builder.progress?.percent ?? null} className="lineup-builder-loading-details"
            aria-valuetext={builder.progress ? `Estimated progress: ${builder.progress.percent}%` : undefined}>
            <ProgressLabel className="lineup-builder-loading-text">
              {progressLabel(builder.progress)}
              {builder.progress && <span className="lineup-builder-loading-percent"
                title="Estimated overall progress">
                {builder.progress.percent}%
              </span>}
            </ProgressLabel>
          </Progress>
        </div>}
        {builder.pending ? <Button shape="square" variant="destructive" onClick={builder.cancel}>Cancel build</Button> : <Button shape="square"
          disabled={scope.length === 0 || !token} onClick={() => {
            setReplacement(null);
            void builder.build({
              sources: scope as ("owned" | "market" | "opponents")[], mandatoryPlayerIds: chosen,
              formations: lineupPreferences, allowBuying, allowSelling,
              includeTradingPurchases: allowBuying && includeTradingPurchases,
              maxCandidates: LINEUP_RECOMMENDATION_LIMIT, explanation: { enabled: false },
            });
          }}>Build</Button>}
      </>}>
      <div className="lineup-builder">
        <section className="lineup-builder-section lineup-builder-pool" aria-labelledby="builder-scope-title">
          <div className="lineup-builder-section-heading">
            <h3 id="builder-scope-title">Player pool</h3>
            <span>Choose at least one source</span>
          </div>
          <fieldset className="lineup-builder-checks" aria-labelledby="builder-scope-title">
            {[
              ["owned", "My squad", "Players you already own", "Consider owned players"],
              ["market", "Market", "Players listed for sale", "Consider players on the market"],
              ["opponents", "Opponents", "Players from rival squads", "Consider opponent players"],
            ].map(([value, label, hint, accessibleLabel]) => (
              <label key={value} className="lineup-builder-source" data-selected={scope.includes(value)}>
                <input type="checkbox" aria-label={`${label}: ${accessibleLabel}`} checked={scope.includes(value)}
                  onChange={() => toggleChoice(value)} />
                <span><strong>{label}</strong><small>{hint}</small></span>
              </label>
            ))}
          </fieldset>
          {scope.length === 0 && <p role="status" className="lineup-builder-scope-hint">Select a player source to enable Build.</p>}
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-trades-title">
          <div className="lineup-builder-section-heading">
            <h3 id="builder-trades-title">Trade recommendations</h3>
            <span>Optional</span>
          </div>
          <div className="lineup-builder-trade-options">
            <label><input type="checkbox" checked={allowBuying} onChange={(e) => setAllowBuying(e.target.checked)} /> Allow purchase recommendations</label>
            <label><input type="checkbox" checked={allowSelling} onChange={(e) => setAllowSelling(e.target.checked)} /> Allow sale recommendations</label>
          </div>
          {allowBuying && <label className="lineup-builder-trading-option"><input type="checkbox" checked={includeTradingPurchases} onChange={(e) => setIncludeTradingPurchases(e.target.checked)} /> Include trading-only purchases</label>}
          {!allowBuying && scope.some((source) => source !== "owned") && <p role="status" className="lineup-builder-scope-hint">
            Enable purchase recommendations to include market or opponent players in proposed lineups.
          </p>}
          <p className="lineup-builder-preview-note">Preview only. Building never buys, sells or saves players.</p>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-player-title">
          <div className="lineup-builder-section-heading"><h3 id="builder-player-title">Mandatory players</h3><span>{chosen.length} / 11 selected</span></div>
          <p className="lineup-builder-section-help">Lock players into the starting XI. Leave empty for the best available combination.</p>
          <details className="lineup-builder-locks">
            <summary>Choose mandatory players <span aria-hidden="true">＋</span></summary>
            <div className="lineup-builder-player-picker">
              <div className="lineup-builder-player-search">
                <label className="lineup-builder-field">
                  <span>Search available players</span>
                  <span className="fb-input-group">
                    <Input value={search} onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search players" aria-label="Search available players" />
                  </span>
                </label>
                <div className="lineup-builder-options" aria-label="Available players">
                  {filteredOptions.map((option) => (
                    <button type="button" key={option.id}
                      disabled={chosen.length >= 11} onClick={() => setChosen((current) => [...current, option.id])}>
                      <ProfilePhoto key={playersById.get(option.id)?.photoUrl ?? "no-photo"}
                        className="lineup-builder-option-photo" url={playersById.get(option.id)?.photoUrl ?? null}
                        fallback={<PersonIcon />} />
                      <span>{option.name}</span><small>{option.source}</small>
                    </button>
                  ))}
                  {filteredOptions.length === 0 ? <p className="fb-helper">
                    {open && (ownTeamQuery.isLoading || marketQuery?.isLoading ||
                      rosterQueries.some((query) => query.isLoading))
                      ? "Loading available players…"
                      : ownTeamQuery.isError || marketQuery?.isError || rosterQueries.some((query) => query.isError)
                        ? "Some player sources could not be loaded."
                        : "No players found."}
                  </p> : null}
                </div>
              </div>
              <div className="lineup-builder-chosen">
                <h4>Starting XI locks</h4>
                {chosenOptions.length ? chosenOptions.map((option) => (
                  <button type="button" key={option.id} aria-label={`Remove ${option.name}`} onClick={() => setChosen((current) =>
                    current.filter((id) => id !== option.id))}>
                    <ProfilePhoto key={playersById.get(option.id)?.photoUrl ?? "no-photo"}
                      className="lineup-builder-option-photo" url={playersById.get(option.id)?.photoUrl ?? null}
                      fallback={<PersonIcon />} />
                    {option.name} <span aria-hidden="true">×</span>
                  </button>
                )) : <p className="fb-helper">No players locked. Add a player from the list.</p>}
              </div>
            </div>
          </details>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-formations-title">
          <div className="lineup-builder-section-heading"><h3 id="builder-formations-title">Formations</h3><span>{lineupPreferences.length ? `${lineupPreferences.length} selected` : "All supported"}</span></div>
          <p className="lineup-builder-section-help">Choose preferred formations, or leave empty to consider all.</p>
          <div className="lineup-builder-formations" aria-label="Available formations">
            {formationOptions.map((formation) => (
              <label key={formation.value}>
                <input type="checkbox" checked={lineupPreferences.includes(formation.value)}
                  onChange={() => toggleFormation(formation.value)} />{formation.label}
              </label>
            ))}
          </div>
        </section>

        {builder.error && <p role="alert">{builder.error}{builder.result ? " Previous results are stale." : ""}</p>}
        {builder.result && changedResult === builder.result && <p role="status">Your acquisition activity changed. Rebuild the recommendations before using a draft.</p>}
        {builder.result && <LineupBuilderResults key={builder.result.buildId} result={builder.result} playersById={playersById}
          ownedPlayerIds={new Set(ownSquad.flatMap((player) => player.masterPlayerId ? [player.masterPlayerId] : []))}
          onAcquire={setAcquiring}
          canApply={(candidate) => !builder.pending && !builder.error && changedResult !== builder.result && canApply(candidate, builder.result!.target.week)}
          onApply={(candidate) => {
            if (isDraftDirty(builder.result!.target.week)) setReplacement({ candidate, build: builder.result! });
            else onApply(candidate, builder.result!.target.week);
          }} />}
        {acquiring && builder.result && <LineupBuilderPlayerActions key={acquiring.playerId}
          player={acquiring} opponentTeamIds={opponents.map((team) => team.teamId)}
          clausesDeadline={builder.result.target.clausesDeadline} onClose={() => setAcquiring(null)}
          onSuccess={() => { builder.cancel(); setChangedResult(builder.result); }} />}
        {replacement && replacement.build === builder.result && <section aria-label="Replace draft confirmation">
          <p>Replace your unsaved lineup draft?</p>
          <Button shape="square" onClick={() => {
            const { candidate, build } = replacement;
            if (changedResult !== build && !builder.pending && !builder.error && canApply(candidate, build.target.week)) onApply(candidate, build.target.week);
            setReplacement(null);
          }}>Replace draft</Button>
          <Button shape="square" variant="secondary" onClick={() => setReplacement(null)}>Keep my draft</Button>
        </section>}
      </div>
    </Dialog>
  );
}
