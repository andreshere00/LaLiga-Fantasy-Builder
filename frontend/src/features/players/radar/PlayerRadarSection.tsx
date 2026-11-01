import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { getJson, paths } from "../../../api/client";
import { ApiError } from "../../../api/errors";
import type { RadarProfileId } from "../../../api/radar";
import { Button } from "../../../components/ui/Button";
import { PlayerRadarPlot } from "./PlayerRadarPlot";

function currentSeason(): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = month >= 7 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The optional query is activated explicitly and never delays the rest of the profile. */
export function PlayerRadarSection({ playerId }: { playerId: string }) {
  const { accessToken, user } = useAuth();
  const [opened, setOpened] = useState(false);
  const [season, setSeason] = useState(currentSeason);
  const [profile, setProfile] = useState<RadarProfileId | undefined>();
  const [comparison, setComparison] = useState<string | undefined>();
  const query = useQuery({
    queryKey: ["players", "radar", user?.userId, playerId, season],
    enabled: opened && !!accessToken && !!user,
    staleTime: 15 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    queryFn: ({ signal }) => getJson(paths.playerRadar(playerId, season), accessToken ?? "", { signal }),
  });
  const radars = query.data?.radars ?? [];
  const selected = radars.find((r) => r.profile === profile) ?? radars[0];
  const compareQuery = useQuery({
    queryKey: ["players", "radar-comparison", user?.userId, playerId, season, selected?.profile, comparison],
    enabled: opened && !!accessToken && !!user && !!comparison && !!selected?.comparisonKey,
    staleTime: 15 * 60_000,
    retry: false,
    queryFn: ({ signal }) => getJson(paths.playerRadar(playerId, season, selected?.profile, comparison), accessToken ?? "", { signal }),
  });
  const candidates = (query.data?.compatiblePlayers ?? []).filter((candidate) => candidate.profile === selected?.profile);
  const seasons = [...new Set([currentSeason(), season, ...(query.data?.availableSeasons ?? [])])].sort().reverse();
  const changeSeason = (next: string) => { setSeason(next); setProfile(undefined); setComparison(undefined); };
  return <section className="player-detail-panel player-detail-section player-radar-section" aria-labelledby="player-radar-title">
    <div className="player-radar-section-header"><div><h2 id="player-radar-title" tabIndex={-1}>Performance profile</h2>
      <p>Seven role-specific percentiles, with their reference sample.</p></div>
      {!opened ? <Button variant="outline" onClick={() => setOpened(true)}>Load performance radar</Button> : <Button variant="outline" loading={query.isFetching} onClick={() => void query.refetch()}>Refresh performance data</Button>}
    </div>
    {opened ? <>
      <div className="player-radar-controls"><label>Radar season<select value={season} onChange={(e) => changeSeason(e.target.value)}>
        {seasons.map((s) => <option key={s} value={s}>{s.replace("-", "/")}</option>)}
      </select></label>
      {radars.length > 1 ? <label>Radar profile<select value={selected?.profile} onChange={(e) => { setProfile(e.target.value as RadarProfileId); setComparison(undefined); }}>
        {radars.map((r) => <option key={r.profile} value={r.profile}>{r.profileLabel}</option>)}
      </select></label> : null}</div>
      {query.isPending ? <p role="status">Loading performance radar…</p> : null}
      {query.isFetching && !query.isPending ? <p role="status">Updating saved radar…</p> : null}
      {query.isError ? <div className="player-radar-notice"><p role="alert">Performance data could not be loaded. Other player statistics remain available.</p>
        <Button variant="outline" loading={query.isFetching} onClick={() => void query.refetch()}>Retry performance data</Button></div> : null}
      {query.data?.status === "unavailable" ? <p>{query.data.reason}</p> : null}
      {selected ? <>
        <PlayerRadarPlot radar={selected} comparison={comparison ? compareQuery.data?.comparison : null} />
        {selected.comparisonKey && candidates.length ? <div className="player-radar-controls">
          <label>Compare player<select value={comparison ?? ""} onChange={(e) => setComparison(e.target.value || undefined)}>
            <option value="">No comparison</option>
            {candidates.map((candidate) => <option key={candidate.playerId} value={candidate.playerId}>{candidate.player}</option>)}
          </select></label>
        </div> : <p className="player-radar-context">{selected.comparisonReason ?? "No compatible players are loaded for this dataset."}</p>}
        {comparison && compareQuery.isFetching ? <p role="status">Loading comparison…</p> : null}
        {comparison && compareQuery.data?.comparisonReason ? <p role="status">{compareQuery.data.comparisonReason}</p> : null}
        {comparison && compareQuery.isError ? <div><p role="alert">Comparison is unavailable. The selected player's radar is still shown.</p>
          <Button variant="outline" onClick={() => void compareQuery.refetch()}>Retry comparison</Button></div> : null}
      </> : null}
    </> : null}
    <p className="player-radar-preview-link"><Link to="/players/radar-preview">Preview the six supplied examples</Link><span>Imported examples, separate from live player data.</span></p>
  </section>;
}
