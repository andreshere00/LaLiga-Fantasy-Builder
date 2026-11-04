import { t, useTranslation } from "../../../i18n";
import { usePlayerRadar } from "./usePlayerRadar";
import { useAuth } from "../../../auth/AuthProvider";
import type { RadarCoverageDto, RadarProfileId } from "../../../api/radar";
import { Button } from "../../../components/ui/Button";
import { Input, NativeSelect } from "../../../components/ui/Fields";
import { radarProfile } from "./radarLocalization";
import { PlayerRadarPlot } from "./PlayerRadarPlot";


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
  season_unavailable: "No performance data is available for the 2026/27 season.",
  expired: "The saved performance data is too old to show. A new validated dataset is needed.",
};
/** Keep identity and account changes as deliberate selection boundaries. */
export function PlayerRadarSection({ playerId, embedded = false }: { playerId: string; embedded?: boolean }) {
  const { user } = useAuth();
  return <RadarContent key={`${user?.userId}:${playerId}`} playerId={playerId} embedded={embedded} />;
}

/** Read a local publication on arrival, independently of other player segments. */
function RadarContent({ playerId, embedded }: { playerId: string; embedded: boolean }) {
  useTranslation();
  const state = usePlayerRadar(playerId);
  const { section, active, setActive, profile, setProfile, notice, query, selected, displayed, paired, resetComparison, refresh, reason, radars } = state;
  if (query.data && !displayed) return null;
  return <section ref={section} className="player-detail-panel player-detail-section player-radar-section" aria-labelledby="player-radar-title" onFocusCapture={() => setActive(true)}>
    <div className="player-radar-section-header"><h2 className="player-section-title" id="player-radar-title" tabIndex={-1}>{t("Performance profile")}</h2>
    <div className="player-radar-controls">
    {radars.length > 1 ? <label>{t("Radar profile")}<NativeSelect value={selected?.profile} onChange={(e) => { setProfile(e.target.value as RadarProfileId); resetComparison(); }}>
      {radars.map((r) => <option key={r.profile} value={r.profile}>{radarProfile(r)}</option>)}
    </NativeSelect></label> : null}
    {query.data?.status === "available" ? <Button variant="outline" loading={query.isFetching} onClick={refresh}>{t("Refresh performance data")}</Button> : null}
    </div></div>
    {notice ? <p role="status" className="player-radar-context">{t(notice)}</p> : null}
    {!active ? <p>{t("Performance data loads when you reach this section.")}</p> : null}
    {active && query.isPending ? <p role="status">{t("Loading performance radar…")}</p> : null}
    {query.isFetching && !query.isPending ? <p role="status">{t("Updating saved radar…")}</p> : null}
    {query.isError ? <div className="player-radar-notice"><p role="alert">{t("Performance data could not be loaded. Other player statistics remain available.")}</p>
      <Button variant="outline" loading={query.isFetching} onClick={refresh}>{t("Retry performance data")}</Button></div> : null}
    {query.data?.status === "unavailable" || reason && reason !== "ready" ? <p>{reason ? t(reasons[reason]) : t(reasons.not_published)}</p> : null}
    {query.data?.coverage && Object.keys(query.data.coverage.profileErrors).length ? <p className="player-radar-notice">{t("Some role profiles could not be updated. Available profiles remain shown.")}</p> : null}
    {profile && selected && selected.profile !== profile ? <p role="status">{t("The selected role is no longer published. Showing ")}{radarProfile(selected)}.</p> : null}
    {displayed ? <>
      <PlayerRadarPlot radar={displayed} comparison={paired?.comparison} embedded={embedded} />
      <RadarComparison state={state} />
    </> : null}
  </section>;
}

function RadarComparison({ state }: { state: ReturnType<typeof usePlayerRadar> }) {
  useTranslation();
  const { selected, candidates, comparisonSummary, search, setSearch, filtered, activeComparison, setComparison, setNotice, comparison, compareQuery, paired } = state;
  if (!selected) return null;
  return <>
      {selected?.comparisonKey && candidates.length ? <details className="player-radar-search">
        <summary ref={comparisonSummary}>{t("Compare with a compatible player")}</summary>
        <p className="player-radar-context">{t("Same role, season and reference population. Choose one player.")}</p>
        <label>{t("Find compatible player")}<Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Name or club")} /></label>
        <p role="status" className="player-radar-context">{filtered.length ? filtered.length === 1 ? t("{{0}} compatible player.", { 0: filtered.length }) : t("{{0}} compatible players.", { 0: filtered.length }) : t("No compatible players match this search. Try another name or club.")} {filtered.length > 20 ? t("Showing the first 20; narrow your search.") : null}</p>
        <ul aria-label={t("Compatible players")}>{filtered.slice(0, 20).map((candidate) => <li key={candidate.playerId}>
          <Button variant="outline" aria-pressed={activeComparison === candidate.playerId} onClick={() => { setComparison(candidate.playerId); setNotice(""); }}>
            {candidate.player} · {(candidate.club ?? t("Club not published"))} · {radarProfile(selected)}
          </Button></li>)}</ul>
      </details> : selected?.comparisonKey ? <p className="player-radar-context">{t("No compatible players are published for this dataset.")}</p> : null}
      {activeComparison ? <Button variant="outline" onClick={() => { setComparison(undefined); setNotice("Comparison removed."); comparisonSummary.current?.focus(); }}>{t("Remove comparison")}</Button> : null}
      {comparison && !activeComparison ? <p role="status">{t("The previous comparison is no longer available in this dataset. Choose another player.")}</p> : null}
      {activeComparison && compareQuery.isFetching ? <p role="status">{t("Loading comparison…")}</p> : null}
      {activeComparison && paired?.comparisonReason ? <p role="status">{t(paired.comparisonReason)}</p> : null}
      {activeComparison && compareQuery.isError ? <div><p role="alert">{paired?.comparison ? t("Comparison could not be updated. The saved pair is still shown.") : t("Comparison is unavailable. The selected player's radar is still shown.")}</p>
        <Button variant="outline" onClick={() => void compareQuery.refetch()}>{t("Retry comparison")}</Button></div> : null}
  </>;
}
