import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useLineupBuilder } from "./useLineupBuilder";
import { LineupBuilderResults } from "./LineupBuilderResults";
import type { BuilderCandidate } from "../../api/schemas";
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
  dirty: boolean;
};

const EMPTY: PlayerOption[] = [];
const EMPTY_SQUAD: SquadCard[] = [];

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
  open, onClose, ranking, squad, selectedTeamId, formations, canApply, onApply, dirty,
}: Props) {
  const { accessToken, user } = useAuth();
  const { selected } = useLeague();
  const id = selected ? leagueId(selected) : "";
  const token = accessToken ?? "";
  const [replacement, setReplacement] = useState<BuilderCandidate | null>(null);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [explain, setExplain] = useState(false);
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
      footer={<>
        {builder.pending && <div className="lineup-builder-loading" role="status">
          <span className="lineup-builder-bounce" aria-hidden="true">
            <span className="lineup-builder-bounce-ball" />
            <span className="lineup-builder-bounce-ground" />
          </span>
          <span>Building recommendations…</span>
        </div>}
        {builder.pending ? <Button shape="square" variant="destructive" onClick={builder.cancel}>Cancel build</Button> : <Button shape="square"
          disabled={scope.length === 0 || !token} onClick={() => void builder.build({
            sources: scope as ("owned" | "market" | "opponents")[], mandatoryPlayerIds: chosen,
            formations: lineupPreferences, allowBuying, allowSelling,
            includeTradingPurchases: allowBuying && includeTradingPurchases,
            maxCandidates: 5, explanation: { enabled: explain },
          })}>Build</Button>}
        <Button shape="square" variant="secondary" className="lineup-builder-close" onClick={onClose}>Close</Button>
      </>}>
      <div className="lineup-builder">
        <section className="lineup-builder-section" aria-labelledby="builder-scope-title">
          <h3 id="builder-scope-title">Player scope options</h3>
          <fieldset className="lineup-builder-checks">
            {[
              ["market", "Consider players on the market"],
              ["owned", "Consider owned players"],
              ["opponents", "Consider opponent players"],

            ].map(([value, label]) => (
              <label key={value}>
                <input type="checkbox" checked={scope.includes(value)}
                  onChange={() => toggleChoice(value)} />{label}
              </label>
            ))}
          </fieldset>
          <label><input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} /> Optional explanation</label>
          <label><input type="checkbox" checked={allowBuying} onChange={(e) => setAllowBuying(e.target.checked)} /> Allow buying</label>
          <label><input type="checkbox" checked={allowSelling} onChange={(e) => setAllowSelling(e.target.checked)} /> Allow selling</label>
          <label><input type="checkbox" disabled={!allowBuying} checked={allowBuying && includeTradingPurchases} onChange={(e) => setIncludeTradingPurchases(e.target.checked)} /> Include trading-only purchases</label>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-player-title">
          <h3 id="builder-player-title">Mandatory players</h3>
          <label className="lineup-builder-field">
            <span>Every selected player must be in the starting XI.</span>
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
          <div className="lineup-builder-chosen">
            <h4>Mandatory players</h4>
            {chosenOptions.length ? chosenOptions.map((option) => (
              <button type="button" key={option.id} aria-label={`Remove ${option.name}`} onClick={() => setChosen((current) =>
                current.filter((id) => id !== option.id))}>
                <ProfilePhoto key={playersById.get(option.id)?.photoUrl ?? "no-photo"}
                  className="lineup-builder-option-photo" url={playersById.get(option.id)?.photoUrl ?? null}
                  fallback={<PersonIcon />} />
                {option.name} <span aria-hidden="true">×</span>
              </button>
            )) : <p className="fb-helper">No players chosen.</p>}
          </div>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-formations-title">
          <h3 id="builder-formations-title">Lineup preferences</h3>
          <p>No selection means all supported formations.</p>
          <div className="lineup-builder-options" aria-label="Available formations">
            {formationOptions.map((formation) => (
              <label key={formation.value}>
                <input type="checkbox" checked={lineupPreferences.includes(formation.value)}
                  onChange={() => toggleFormation(formation.value)} />{formation.label}
              </label>
            ))}
          </div>
        </section>

        {builder.error && <p role="alert">{builder.error}{builder.result ? " Previous results are stale." : ""}</p>}
        {builder.result && <LineupBuilderResults result={builder.result} playersById={playersById}
          canApply={(candidate) => !builder.pending && !builder.error && canApply(candidate, builder.result!.target.week)}
          onApply={(candidate) => {
            if (dirty) setReplacement(candidate);
            else onApply(candidate, builder.result!.target.week);
          }} />}
        {replacement && builder.result && <section aria-label="Replace draft confirmation">
          <p>Replace your unsaved lineup draft?</p>
          <Button shape="square" onClick={() => {
            if (canApply(replacement, builder.result!.target.week)) onApply(replacement, builder.result!.target.week);
            setReplacement(null);
          }}>Replace draft</Button>
          <Button shape="square" variant="secondary" onClick={() => setReplacement(null)}>Keep my draft</Button>
        </section>}
      </div>
    </Dialog>
  );
}
