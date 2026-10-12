import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { getJson, paths } from "../../api/client";
import {
  leagueId,
  playersOf,
  squadCards,
  text,
  type RankingEntry,
  type SquadCard,
} from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Fields";
import { DEFAULT_LINEUPS_AVAILABLE } from "./formations";
import { useLeague } from "./LeagueProvider";
import { marketItems, masterIdOf, masterOf } from "../market/model/listing";
import "./LineupBuilderDialog.css";

type PlayerOption = { id: string; name: string; source: string };

type Props = {
  open: boolean;
  onClose: () => void;
  ranking: RankingEntry[];
  squad: SquadCard[];
  selectedTeamId: string | null;
  formations: { value: string; label: string }[];
};

const EMPTY: PlayerOption[] = [];
const EMPTY_SQUAD: SquadCard[] = [];

function squadOptions(players: readonly SquadCard[], source: string): PlayerOption[] {
  return players.map((player) => ({
    id: `${source === "My squad" ? "owned" : "opponent"}:${source}:${player.id}`,
    name: player.name,
    source,
  }));
}

export function LineupBuilderDialog({
  open, onClose, ranking, squad, selectedTeamId, formations,
}: Props) {
  const { accessToken } = useAuth();
  const { selected } = useLeague();
  const id = selected ? leagueId(selected) : "";
  const token = accessToken ?? "";
  const [instructions, setInstructions] = useState("");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [scope, setScope] = useState<string[]>(["owned"]);
  const [lineupPreferences, setLineupPreferences] = useState<string[]>([]);
  const [effort, setEffort] = useState("mid");
  const ownTeamId = selected?.team?.id == null ? "" : String(selected.team.id);
  const ownTeamQuery = useQuery({
    queryKey: ["builder-own-roster", id, ownTeamId],
    enabled: open && id.length > 0 && ownTeamId.length > 0 && token.length > 0 &&
      selectedTeamId !== ownTeamId,
    queryFn: ({ signal }) => getJson(paths.team(id, ownTeamId), token, { signal }),
  });
  const ownSquad = selectedTeamId === ownTeamId
    ? squad
    : ownTeamQuery.data
      ? squadCards(playersOf(ownTeamQuery.data), null)
      : EMPTY_SQUAD;
  const opponents = ranking.filter((team) => team.selectable && team.teamId !== selected?.team?.id);
  const rosterQueries = useQueries({
    queries: opponents.map((team) => ({
      queryKey: ["builder-roster", id, team.teamId],
      enabled: open && id.length > 0 && token.length > 0,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.team(id, team.teamId), token, { signal }),
    })),
  });
  const marketQuery = useQueries({
    queries: [{
      queryKey: ["builder-market", id],
      enabled: open && id.length > 0 && token.length > 0,
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
    return playerId && name ? [{ id: `market:${playerId}`, name, source: "Market" }] : [];
  }), [marketQuery?.data]);
  const allOptions = useMemo(() => [
    ...squadOptions(ownSquad, "My squad"),
    ...opponentOptions,
    ...marketOptions,
  ], [marketOptions, opponentOptions, ownSquad]);
  const scopeOptions = allOptions.filter((option) => {
    if (option.id.startsWith("owned:")) return scope.includes("owned");
    if (option.id.startsWith("opponent:")) return scope.includes("opponents");
    return scope.includes("market");
  });
  const formationOptions = useMemo(() => {
    const defaults = [...DEFAULT_LINEUPS_AVAILABLE.free, ...DEFAULT_LINEUPS_AVAILABLE.premium]
      .map((value) => ({ value, label: value.replaceAll(",", "-") }));
    return [...new Map([...defaults, ...formations].map((item) => [item.value, item])).values()];
  }, [formations]);

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
    <Dialog open={open} onClose={onClose} title="Build lineup"
      footer={<button type="button" onClick={onClose}>Close</button>}>
      <div className="lineup-builder">
        <label className="lineup-builder-field">
          <span>User preferences <small>{instructions.length}/1024</small></span>
          <textarea className="fb-input" maxLength={1024} rows={4} value={instructions}
            onChange={(event) => setInstructions(event.target.value)} />
        </label>

        <section className="lineup-builder-section" aria-labelledby="builder-scope-title">
          <h3 id="builder-scope-title">Player scope options</h3>
          <fieldset className="lineup-builder-checks">
            {[
              ["market", "Consider players on the market"],
              ["owned", "Consider owned players"],
              ["opponents", "Consider opponent players"],
              ["trading", "Consider buying and selling players"],
            ].map(([value, label]) => (
              <label key={value}>
                <input type="checkbox" checked={scope.includes(value)}
                  onChange={() => toggleChoice(value)} />{label}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-player-title">
          <h3 id="builder-player-title">Player preferences</h3>
          <label className="lineup-builder-field">
            <span>Add the players you would prefer to have in your lineup.</span>
            <span className="fb-input-group">
              <Input value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="Search players" aria-label="Search available players" />
            </span>
          </label>
          <div className="lineup-builder-options" role="listbox" aria-multiselectable="true" aria-label="Available players">
            {filteredOptions.map((option) => (
              <button type="button" role="option" aria-selected="false" key={option.id}
                onClick={() => setChosen((current) => [...current, option.id])}>
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
            <h4>Chosen players</h4>
            {chosenOptions.length ? chosenOptions.map((option) => (
              <button type="button" key={option.id} onClick={() => setChosen((current) =>
                current.filter((id) => id !== option.id))}>
                {option.name} <span aria-hidden="true">×</span>
              </button>
            )) : <p className="fb-helper">No players chosen.</p>}
          </div>
        </section>

        <section className="lineup-builder-section" aria-labelledby="builder-formations-title">
          <h3 id="builder-formations-title">Lineup preferences</h3>
          <div className="lineup-builder-options" aria-label="Available formations">
            {formationOptions.map((formation) => (
              <label key={formation.value}>
                <input type="checkbox" checked={lineupPreferences.includes(formation.value)}
                  onChange={() => toggleFormation(formation.value)} />{formation.label}
              </label>
            ))}
          </div>
        </section>

        <section className="lineup-builder-section">
          <h3>Thinking effort</h3>
          <RadioGroup className="lineup-builder-radio" value={effort} onValueChange={setEffort}
            aria-label="Thinking effort">
            {[["none", "None"], ["low", "Low"], ["mid", "Mid"], ["high", "High"],
              ["extra", "Extra"]].map(([value, label]) => (
              <label key={value}>
                <Radio.Root value={value} className="lineup-builder-radio-item">
                  <Radio.Indicator className="lineup-builder-radio-indicator" />
                </Radio.Root>{label}
              </label>
            ))}
          </RadioGroup>
        </section>
      </div>
    </Dialog>
  );
}
