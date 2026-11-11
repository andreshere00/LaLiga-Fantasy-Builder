import { useLayoutEffect, useRef } from "react";
import { ClubLink } from "../../components/links/EntityLinks";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Collapsible } from "@base-ui/react/collapsible";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";
import { leagueId } from "../../api/mappers";
import { formatEuro } from "../../api/format";
import { locale, t, useTranslation } from "../../i18n";
import { useLeague } from "../lineup/LeagueProvider";
import { usePlayersBoard } from "../players/usePlayersBoard";
import { PlayerScoreBadge, PlayerTile } from "../lineup/PlayerTile";
import { PositionCell } from "../market/cells/PositionCell";
import { PlayerBookmarkButton } from "../players/PlayerBookmarkButton";
import { alertMessages, useScouting } from "./ScoutingProvider";
import type { Favorite, Watch } from "./client";
import type { PlayerRow } from "../players/model/playerRow";
import "./ScoutingPanel.css";

const disabledWatch: Watch = { marketAlert: false, clauseAlert: false, leadHours: 24 };
function timestamp(value: string) {
  return new Intl.DateTimeFormat(locale(), { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(value));
}
function hoursLabel(hours: Watch["leadHours"]) {
  return t(hours === 1 ? "{{0}} hour" : "{{0}} hours", { 0: hours });
}

function FavoriteCard({ favorite, row, details }: { favorite: Favorite; row?: PlayerRow; details: () => void }) {
  const scouting = useScouting();
  const { selected } = useLeague();
  const prefs = favorite.watch ?? disabledWatch;
  const observed = favorite.observation;
  const name = row?.name ?? observed?.name ?? favorite.playerId;
  const save = (patch: Partial<Watch>) => scouting.watchMutation.mutate({ player: favorite.playerId, prefs: { ...prefs, ...patch } });
  const pending = scouting.watchMutation.isPending || !selected;
  const saving = scouting.watchMutation.isPending && scouting.watchMutation.variables?.player === favorite.playerId;
  const saveFailed = scouting.watchMutation.isError && scouting.watchMutation.variables?.player === favorite.playerId;
  const form = row?.formRecent.slice(0, 5).reverse() ?? [];
  const alertSummary = prefs.marketAlert && prefs.clauseAlert ? t("Market and clause")
    : prefs.marketAlert ? t("Market only") : prefs.clauseAlert ? t("Clause only") : t("Alerts off");
  const clauseStatus = observed?.available ? t("Clause available")
    : observed?.shielded === true ? t("Shield active")
    : observed?.unlockAt && new Date(observed.unlockAt).getTime() > Date.now()
      ? t("Unlocks {{0}}", { 0: timestamp(observed.unlockAt) }) : t("Protection status unknown");
  return <li className="scouting-card">
    <div className="scouting-player">
      {row ? <PlayerTile name={name} captain={false} variant="squad" showName={false}
        photoUrl={row.photoUrl} teamBadgeUrl={row.teamBadgeUrl} /> : null}
      <div className="scouting-player-title">
        <h3><button type="button" className="scouting-name" onClick={details}>{name}</button></h3>
        <span><span>{row?.teamName ? <ClubLink badgeUrl={row.teamBadgeUrl} name={row.teamName}>{row.teamName}</ClubLink> : "—"}</span><PositionCell positionId={row?.positionId ?? null} /></span>
      </div>
      <PlayerBookmarkButton pressed playerName={name} disabled={scouting.pending} onToggle={() => scouting.toggle(favorite.playerId)} />
    </div>
    <dl className="scouting-facts">
      <div><dt>{t("Points")}</dt><dd>{row?.points ?? "—"}</dd></div>
      <div><dt>{t("Market value")}</dt><dd>{row?.marketValue == null ? "—" : formatEuro(row.marketValue)}</dd></div>
      <div><dt>{t("Form")}</dt><dd>{form.length ? <span className="scouting-form" role="img"
        aria-label={t("Last performances: {{0}} points", { 0: form.join(", ") })}>
        {form.map((points, index) => <PlayerScoreBadge key={index} points={points} />)}
      </span> : "—"}</dd></div>
      <div><dt>{t("Owned by")}</dt><dd>{observed?.ownerName ?? row?.ownedBy ?? "—"}</dd></div>
    </dl>
    <dl className="scouting-availability">
      <div><dt>{t("Market")}</dt><dd data-available={!!observed?.listings.length}>
        {!observed ? t("Awaiting first check") : observed.listings.length ? t("On the market") : t("Not on the market")}
      </dd></div>
      <div><dt>{t("Release clause")}</dt><dd data-available={observed?.available ?? false}>
        {observed?.clause != null ? <strong>{formatEuro(observed.clause)}</strong> : null}
        <span>{observed ? clauseStatus : t("Awaiting first check")}</span>
      </dd></div>
    </dl>
    <div className="scouting-card-footer">
      <small>{observed ? t("Checked {{0}}", { 0: timestamp(observed.checkedAt) }) : t("No confirmed league data yet")}</small>
      <Button variant="outline" onClick={details}>{t("Player details")}</Button>
    </div>
    <Collapsible.Root className="scouting-alert-settings">
      <Collapsible.Trigger className="scouting-alert-trigger">
        <span><strong>{t("Alerts in this league")}</strong><small>{alertSummary}{prefs.clauseAlert ? ` · ${hoursLabel(prefs.leadHours)}` : ""}</small></span>
        <span className="scouting-chevron" aria-hidden="true">⌄</span>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <fieldset className="scouting-preferences" disabled={pending} aria-busy={saving}>
          <legend className="visually-hidden">{t("Alerts in this league")}</legend>
          <label><Checkbox disabled={pending} checked={prefs.marketAlert} onCheckedChange={checked => save({ marketAlert: checked })} />{t("When listed on the market")}</label>
          <label><Checkbox disabled={pending} checked={prefs.clauseAlert} onCheckedChange={checked => save({ clauseAlert: checked })} />{t("Before and when the clause unlocks")}</label>
          {prefs.clauseAlert ? <label className="scouting-lead-time">{t("Advance warning")}<select className="fb-native-select" value={prefs.leadHours} onChange={event => save({ leadHours: Number(event.target.value) as Watch["leadHours"] })}>
            {([1, 6, 24] as const).map(hours => <option key={hours} value={hours}>{hoursLabel(hours)}</option>)}
          </select></label> : null}
        </fieldset>
        {saving ? <p className="scouting-save-status" role="status">{t("Saving alerts…")}</p> : null}
        {saveFailed ? <p className="scouting-save-error" role="alert">{t("Alert preferences could not be saved. Try again.")}</p> : null}
        {!selected ? <p className="scouting-save-status">{t("Select a league to configure alerts.")}</p> : null}
      </Collapsible.Panel>
    </Collapsible.Root>
  </li>;
}

function PanelContent({ details }: { details: (player: string, league?: string) => void }) {
  const scouting = useScouting();
  const board = usePlayersBoard();
  const content = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const tab = params.get("scouting") === "alerts" ? "alerts" : "favorites";
  const query = params.get("scoutingQuery") ?? "";
  const filter = params.get("scoutingFilter") ?? "all";
  const { selected, leagues } = useLeague();
  const patch = (key: string, value: string) => {
    const next = new URLSearchParams(params); next.set(key, value); setParams(next, { replace: true });
  };
  const rows = new Map(board.rows.map(row => [row.playerId, row]));
  const favorites = (scouting.favoritesQuery.data?.favorites ?? []).filter(favorite => {
    const row = rows.get(favorite.playerId);
    const text = `${row?.name ?? favorite.observation?.name ?? favorite.playerId} ${row?.teamName ?? ""}`;
    return text.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (
      filter === "all" || (filter === "market" && !!favorite.observation?.listings.length)
      || (filter === "clause" && favorite.observation?.available)
    );
  });
  const scrollKey = `${selected?.id ?? ""}:${tab}:${query}:${filter}`;
  useLayoutEffect(() => {
    const body = content.current?.closest(".fb-dialog-body");
    if (!(body instanceof HTMLElement)) return;
    body.scrollTop = scouting.panelScroll.current[scrollKey] ?? 0;
    const saveScroll = () => { scouting.panelScroll.current[scrollKey] = body.scrollTop; };
    body.addEventListener("scroll", saveScroll);
    return () => body.removeEventListener("scroll", saveScroll);
  }, [scrollKey, scouting.panelScroll, board.isLoading, scouting.favoritesQuery.isPending]);
  const health = scouting.favoritesQuery.data?.status;
  return <div ref={content}>
    <div className="scouting-tabs" role="group" aria-label={t("Scouting views")}>
      <Button variant="ghost" aria-pressed={tab === "favorites"} onClick={() => patch("scouting", "favorites")}>{t("Favorites")} ({scouting.favorites.size})</Button>
      <Button variant="ghost" aria-pressed={tab === "alerts"} onClick={() => patch("scouting", "alerts")}>{t("Alerts")} ({scouting.unread})</Button>
    </div>
    <p className="scouting-league">{t("League")}: <strong>{selected?.name ?? "—"}</strong></p>
    {health === "needs_reauth" ? <p role="alert">{t("Monitoring paused. Reconnect LaLiga in your account, then refresh monitoring.")}</p> : null}
    {health === "not_member" ? <p role="alert">{t("Monitoring paused: this account no longer belongs to the league.")}</p> : null}
    {health === "degraded" ? <p role="status">{t("Some checks failed. Showing the last confirmed data; monitoring will retry.")}</p> : null}
    {scouting.importMutation.isError ? <p role="alert">{t("Device favorites could not be imported.")} <Button onClick={scouting.retryImport}>{t("Retry")}</Button></p> : null}
    {tab === "favorites" ? <>
      {board.hasError || board.isDegraded ? <p role="status">{t("Some league data could not be loaded. Ownership and form may be incomplete.")}</p> : null}
      <div className="scouting-filters">
        <label>{t("Search favorites")}<input className="fb-input" type="search" value={query} onChange={event => patch("scoutingQuery", event.target.value)} placeholder={t("Name or club")} /></label>
        <label>{t("Show")}<select className="fb-native-select" value={filter} onChange={event => patch("scoutingFilter", event.target.value)}>
          <option value="all">{t("All favorites")}</option><option value="market">{t("On the market")}</option><option value="clause">{t("Clause available")}</option>
        </select></label>
      </div>
      <div className="scouting-refresh"><small>{t("Alerts are checked even when the website is closed.")}</small>
        <Button variant="outline" disabled={!selected} loading={scouting.refresh.isPending} onClick={() => scouting.refresh.mutate()}>{t("Refresh monitoring")}</Button></div>
      {scouting.favoritesQuery.isPending ? <p role="status">{t("Loading favorites…")}</p> : scouting.favoritesQuery.isError ? <p role="alert">{t("Favorites could not be loaded.")} <Button onClick={() => void scouting.favoritesQuery.refetch()}>{t("Retry")}</Button></p>
        : !scouting.favorites.size ? <p>{t("Save players with the bookmark button to follow them here.")}</p>
        : !favorites.length ? <p>{t("No favorites match your filters.")}</p>
        : <ul className="scouting-list">{favorites.map(favorite => <FavoriteCard key={favorite.playerId} favorite={favorite} row={rows.get(favorite.playerId)} details={() => details(favorite.playerId)} />)}</ul>}
    </> : <>
      <p className="scouting-help">{t("Alerts from all your leagues. Opening this list does not mark them as read.")}</p>
      {scouting.inbox.isPending ? <p role="status">{t("Loading alerts…")}</p> : null}
      {scouting.inbox.isError ? <p role="alert">{t("Alerts could not be loaded.")} <Button onClick={() => void scouting.inbox.refetch()}>{t("Retry")}</Button></p> : null}
      {scouting.inbox.isSuccess && !scouting.inbox.data.pages[0].notifications.length ? <p>{t("No scouting alerts yet.")}</p> : null}
      <ul className="scouting-list">{scouting.inbox.data?.pages.flatMap(page => page.notifications).map(event => <li key={event.id} className={"scouting-card" + (!event.readAt ? " scouting-card--unread" : "")}>
        <strong>{event.playerName}</strong><p>{t(alertMessages[event.kind])}</p>
        <small>{event.leagueName} · {timestamp(event.createdAt)}</small>
        <div className="scouting-card-footer">
          {!event.readAt ? <Button variant="ghost" disabled={scouting.read.isPending} onClick={() => scouting.read.mutate(event.id)}>{t("Mark as read")}</Button> : <span>{t("Read")}</span>}
          {leagues.some(league => leagueId(league) === event.leagueId)
            ? <Button onClick={() => { scouting.read.mutate(event.id); details(event.playerId, event.leagueId); }}>{t("Player details")}</Button>
            : <span>{t("League no longer available")}</span>}
        </div>
      </li>)}</ul>
      {scouting.inbox.hasNextPage ? <Button loading={scouting.inbox.isFetchingNextPage} onClick={() => void scouting.inbox.fetchNextPage()}>{t("Load more alerts")}</Button> : null}
    </>}
  </div>;
}

/** Opens the scouting dialog by setting the URL param; the dialog itself lives in the header. */
export function ScoutingPanel() {
  useTranslation();
  const scouting = useScouting();
  const [params, setParams] = useSearchParams();
  return <Button variant="outline" data-scouting-trigger="" icon={
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4V3Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  } onClick={() => { const next = new URLSearchParams(params); next.set("scouting", "favorites"); setParams(next, { replace: true }); }}>
    {t("Favorites")} ({scouting.favorites.size}){scouting.unread > 0 ? <span className="scouting-unread" aria-label={t("{{0}} unread alerts", { 0: scouting.unread })}>{scouting.unread}</span> : null}
  </Button>;
}

/** The favorites and alerts dialog, mounted once so any page can open it with `?scouting=`. */
export function ScoutingDialog() {
  useTranslation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectLeague } = useLeague();
  const pendingNavigation = useRef<{ player: string; league?: string; returnTo: string } | null>(null);
  const open = params.has("scouting");
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("scouting"); next.delete("scoutingQuery"); next.delete("scoutingFilter");
    setParams(next, { replace: true });
  };
  return <Dialog open={open} title={t("Favorites and scouting")} layout="sheet" className="scouting-panel" onClose={close}
      footer={<Button variant="outline" onClick={close}>{t("Close")}</Button>}
      // The opener lives on the page and the dialog in the header, so hand focus back by marker.
      finalFocus={() => document.querySelector<HTMLElement>("[data-scouting-trigger]") ?? false}
      onOpenChangeComplete={next => {
        if (!next && pendingNavigation.current) {
          const target = pendingNavigation.current; pendingNavigation.current = null;
          if (target.league) selectLeague(target.league);
          navigate(`/players/${encodeURIComponent(target.player)}`, { state: { returnTo: target.returnTo } });
        }
      }}>
      {open ? <PanelContent details={(player, league) => {
        pendingNavigation.current = { player, league, returnTo: location.pathname + location.search };
        close();
      }} /> : null}
    </Dialog>;
}
