import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { getJson, paths } from "../../../api/client";
import { ApiError } from "../../../api/errors";
import type { RadarCoverageDto, RadarProfileId } from "../../../api/radar";
import { Button } from "../../../components/ui/Button";
import { Input, NativeSelect } from "../../../components/ui/Fields";
import { PlayerRadarPlot } from "./PlayerRadarPlot";

function currentSeason(): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = month >= 7 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const reasons: Record<RadarCoverageDto["reasonCode"], string> = {
  ready: "",
  identity_pending: "This player's identity is awaiting review. A radar will appear once verified data is published.",
  identity_ambiguous: "This player's identity needs review before performance data can be shown.",
  identity_not_found: "No verified source profile is linked to this player.",
  role_unresolved: "This player's team role is awaiting review.",
  not_published: "No performance data has been published for this player in this season.",
  insufficient_minutes: "The verified league minutes are below the minimum required for this season’s radar.",
  incomplete_metrics: "Some of the seven metrics have not been published.",
  out_of_scope: "This player is outside the season and competition covered by the current radar dataset.",
  season_unavailable: "No performance data is available for this season. Choose a published season when available.",
  expired: "The saved performance data is too old to show. A new validated dataset is needed.",
};
const searchText = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");

/** Keep identity and account changes as deliberate selection boundaries. */
export function PlayerRadarSection({ playerId }: { playerId: string }) {
  const { user } = useAuth();
  return <RadarContent key={`${user?.userId}:${playerId}`} playerId={playerId} />;
}

/** Read a local publication on arrival, independently of other player segments. */
function RadarContent({ playerId }: { playerId: string }) {
  const { accessToken, user } = useAuth();
  const section = useRef<HTMLElement>(null);
  const comparisonSummary = useRef<HTMLElement>(null);
  const [active, setActive] = useState(() => typeof IntersectionObserver === "undefined");
  const [season, setSeason] = useState(currentSeason);
  const [profile, setProfile] = useState<RadarProfileId | undefined>();
  const [comparison, setComparison] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (active || !section.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setActive(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px 0px" });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, [active]);
  const query = useQuery({
    queryKey: ["players", "radar", user?.userId, playerId, season],
    enabled: active && !!accessToken && !!user,
    staleTime: 15 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    queryFn: ({ signal }) => getJson(paths.playerRadar(playerId, season), accessToken ?? "", { signal }),
  });
  const radars = query.data?.radars ?? [];
  const selected = radars.find((r) => r.profile === profile) ??
    radars.find((r) => r.profile === query.data?.defaultProfile) ?? radars[0];
  const candidates = (query.data?.compatiblePlayers ?? []).filter((candidate) => candidate.profile === selected?.profile);
  const activeComparison = candidates.some((candidate) => candidate.playerId === comparison) ? comparison : undefined;
  const compareQuery = useQuery({
    queryKey: ["players", "radar-comparison", user?.userId, playerId, season, selected?.profile, activeComparison, query.data?.coverage?.datasetId, selected?.snapshotId],
    enabled: active && !!accessToken && !!user && !!activeComparison && !!selected?.comparisonKey,
    staleTime: 15 * 60_000,
    retry: false,
    queryFn: ({ signal }) => getJson(paths.playerRadar(playerId, season, selected?.profile, activeComparison), accessToken ?? "", { signal }),
  });
  // An overlay and its primary must come from the same pinned server response.
  const paired = activeComparison ? compareQuery.data : undefined;
  const displayed = paired?.radars.find((r) => r.profile === selected?.profile) ?? selected;
  const filtered = candidates.filter((candidate) => searchText(`${candidate.player} ${candidate.club ?? ""}`).includes(searchText(search.trim())));
  const seasons = [...new Set([currentSeason(), season, ...(query.data?.availableSeasons ?? [])])].sort().reverse();
  const resetComparison = () => {
    if (comparison) setNotice("Comparison cleared because the season or role changed.");
    setComparison(undefined); setSearch("");
  };
  const refresh = () => {
    void query.refetch();
    if (activeComparison) void compareQuery.refetch();
  };
  const reason = query.data?.coverage?.reasonCode;
  return <section ref={section} className="player-detail-panel player-detail-section player-radar-section" aria-labelledby="player-radar-title" onFocusCapture={() => setActive(true)}>
    <div className="player-radar-section-header"><div><h2 className="player-section-title" id="player-radar-title" tabIndex={-1}>Performance profile</h2>
      <p>Seven role-specific percentiles, with their reference sample.</p></div>
      {query.data?.status === "available" ? <Button variant="outline" loading={query.isFetching} onClick={refresh}>Refresh performance data</Button> : null}
    </div>
    <div className="player-radar-controls"><label>Radar season<NativeSelect value={season} onChange={(e) => { setSeason(e.target.value); setProfile(undefined); resetComparison(); }}>
      {seasons.map((s) => <option key={s} value={s}>{s.replace("-", "/")}</option>)}
    </NativeSelect></label>
    {radars.length > 1 ? <label>Radar profile<NativeSelect value={selected?.profile} onChange={(e) => { setProfile(e.target.value as RadarProfileId); resetComparison(); }}>
      {radars.map((r) => <option key={r.profile} value={r.profile}>{r.profileLabel}</option>)}
    </NativeSelect></label> : null}</div>
    {notice ? <p role="status" className="player-radar-context">{notice}</p> : null}
    {!active ? <p>Performance data loads when you reach this section.</p> : null}
    {active && query.isPending ? <p role="status">Loading performance radar…</p> : null}
    {query.isFetching && !query.isPending ? <p role="status">Updating saved radar…</p> : null}
    {query.isError ? <div className="player-radar-notice"><p role="alert">Performance data could not be loaded. Other player statistics remain available.</p>
      <Button variant="outline" loading={query.isFetching} onClick={refresh}>Retry performance data</Button></div> : null}
    {query.data?.status === "unavailable" || reason && reason !== "ready" ? <p>{reason ? reasons[reason] : reasons.not_published}</p> : null}
    {query.data?.coverage && Object.keys(query.data.coverage.profileErrors).length ? <p className="player-radar-notice">Some role profiles could not be updated. Available profiles remain shown.</p> : null}
    {profile && selected && selected.profile !== profile ? <p role="status">The selected role is no longer published. Showing {selected.profileLabel}.</p> : null}
    {displayed ? <>
      <PlayerRadarPlot radar={displayed} comparison={paired?.comparison} />
      {selected?.comparisonKey && candidates.length ? <details className="player-radar-search">
        <summary ref={comparisonSummary}>Compare with a compatible player</summary>
        <p className="player-radar-context">Same role, season and reference population. Choose one player.</p>
        <label>Find compatible player<Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or club" /></label>
        <p role="status" className="player-radar-context">{filtered.length ? `${filtered.length} compatible ${filtered.length === 1 ? "player" : "players"}${filtered.length > 20 ? ". Showing the first 20; narrow your search." : "."}` : "No compatible players match this search. Try another name or club."}</p>
        <ul aria-label="Compatible players">{filtered.slice(0, 20).map((candidate) => <li key={candidate.playerId}>
          <Button variant="outline" aria-pressed={activeComparison === candidate.playerId} onClick={() => { setComparison(candidate.playerId); setNotice(""); }}>
            {candidate.player} · {candidate.club ?? "Club not published"} · {selected.profileLabel}
          </Button></li>)}</ul>
      </details> : <p className="player-radar-context">{displayed.comparisonReason ?? "No compatible players are published for this dataset."}</p>}
      {activeComparison ? <Button variant="outline" onClick={() => { setComparison(undefined); setNotice("Comparison removed."); comparisonSummary.current?.focus(); }}>Remove comparison</Button> : null}
      {comparison && !activeComparison ? <p role="status">The previous comparison is no longer available in this dataset. Choose another player.</p> : null}
      {activeComparison && compareQuery.isFetching ? <p role="status">Loading comparison…</p> : null}
      {activeComparison && paired?.comparisonReason ? <p role="status">{paired.comparisonReason}</p> : null}
      {activeComparison && compareQuery.isError ? <div><p role="alert">{paired?.comparison ? "Comparison could not be updated. The saved pair is still shown." : "Comparison is unavailable. The selected player's radar is still shown."}</p>
        <Button variant="outline" onClick={() => void compareQuery.refetch()}>Retry comparison</Button></div> : null}
    </> : null}
  </section>;
}
