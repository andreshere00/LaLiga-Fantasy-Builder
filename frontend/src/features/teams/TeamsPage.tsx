import { Button } from "../../components/ui/Button";
import { useEffect, useRef, useState } from "react";
import { t, useTranslation } from "../../i18n";
import {
  useClubDossierQuery, useClubIndexQuery, useClubRosterStatsQuery, useCompetitionStandingsQuery,
  useReauthOnError,
} from "../../api/queries";
import { ApiError } from "../../api/errors";
import { useAuth } from "../../auth/AuthProvider";
import { GatePanel } from "../gates/GatePanel";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  DEFAULT_SECTION, initialClubId, TEAM_SECTIONS, teamPath, teamSearch, teamSectionId, type TeamSection,
} from "./teamRoutes";
import { TeamPlayersSection } from "./TeamPlayersSection";
import { TeamPerformanceSection } from "./TeamPerformanceSection";
import { TeamLineupSection } from "./TeamLineupSection";
import { TeamNewsInjuriesSection } from "./TeamNewsInjuriesSection";
import { TeamSectionIcon } from "./TeamSectionIcon";
import {
  TeamDossierLoading, TeamPickerSkeleton, TeamSectionSkeleton,
} from "./TeamSkeletons";
import type { TeamRouteState } from "./teamRoutes";
import "./teams.css";

const SECTION_LABELS: Record<TeamSection, string> = {
  performance: "Performance",
  players: "Players",
  lineup: "Lineup",
  news: "News & Injuries",
};

export function TeamsPage({ opponentClubId = null }: { opponentClubId?: number | null }) {
  useTranslation();
  const { status } = useAuth();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const route = teamSearch(search);
  const index = useClubIndexQuery();
  const clubId = params.clubId ?? null;
  const dossier = useClubDossierQuery(clubId);
  const seasonStats = useClubRosterStatsQuery(dossier.data?.roster ? clubId : null);
  const standings = useCompetitionStandingsQuery();
  useReauthOnError([index.error, dossier.error]);
  const clubs = index.data?.clubs ?? [];
  const [reading, setReading] = useState<TeamSection | null>(null);
  useEffect(() => {
    if (status !== "ready") return undefined;
    const update = () => setReading(sectionInView());
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [status, clubId]);
  useEffect(() => {
    // On narrow screens the picker scrolls; keep the selected club visible after a deep link or a pick.
    const active = document.querySelector<HTMLElement>('.team-picker [aria-current="page"]');
    if (typeof active?.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [clubId, clubs.length]);
  const restored = useRef<string | null>(null);
  useEffect(() => {
    // A deep link such as ?section=lineup lands on that section once the dossier is drawn.
    // Content above it (photos, radar chips) can still shift, so the jump repeats while the
    // page settles, unless the reader has already started scrolling.
    if (!dossier.data || restored.current === clubId) return undefined;
    restored.current = clubId;
    if (route.section === DEFAULT_SECTION) return undefined;
    let cancelled = false;
    const stop = () => { cancelled = true; };
    const events = ["wheel", "touchstart", "keydown"] as const;
    for (const name of events) window.addEventListener(name, stop, { once: true, passive: true });
    const jump = () => {
      if (cancelled) return;
      const anchor = window.location.hash.slice(1);
      const target = (anchor ? document.getElementById(anchor) : null) ??
        document.getElementById(teamSectionId(route.section));
      if (typeof target?.scrollIntoView === "function") target.scrollIntoView();
    };
    jump();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(jump) : null;
    observer?.observe(document.body);
    const settle = window.setTimeout(() => observer?.disconnect(), 5000);
    return () => {
      observer?.disconnect();
      window.clearTimeout(settle);
      for (const name of events) window.removeEventListener(name, stop);
    };
  }, [dossier.data, clubId, route.section]);
  const current = reading ?? route.section;
  if (status !== "ready") return <GatePanel status={status} />;
  if (!clubId && clubs.length > 0) {
    const next = initialClubId(clubs, document.documentElement.lang || "en", { opponentClubId });
    if (next != null) return <Navigate to={teamPath(next, route)} replace />;
  }
  const loading = index.isLoading || dossier.isLoading;
  const selected = clubs.find((club) => String(club.clubId) === clubId);
  const standing = standings.data?.rows.find((row) => String(row.team.id) === clubId) ?? null;
  function replaceRoute(patch: Partial<TeamRouteState>) {
    if (!clubId) return;
    const url = teamPath(clubId, { ...route, ...patch });
    const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    setSearch(new URLSearchParams(query), { replace: true });
  }
  return (
    <div className="team-page">
      <header className="team-masthead">
        {selected?.badgeUrl ? <img src={selected.badgeUrl} alt="" /> : null}
        <h1 className="fb-title">{selected?.name ?? t("Teams")}</h1>
        {standing ? (
          <p className="team-rank">
            <span className="visually-hidden">{t("LaLiga position {{0}}", { 0: standing.position })}, </span>
            <strong aria-hidden="true">#{standing.position}</strong>
            <span>{t("LaLiga")} · {t("{{0}} pts", { 0: standing.points })}</span>
          </p>
        ) : null}
      </header>
      {index.isLoading && clubs.length === 0 ? <TeamPickerSkeleton /> : null}
      <nav className="team-picker" aria-label={t("Choose a club")} hidden={clubs.length === 0}>
        {clubs.map((club) => (
          <Link
            key={club.clubId}
            to={teamPath(club.clubId, route)}
            title={club.name}
            aria-current={String(club.clubId) === clubId ? "page" : undefined}
          >
            {club.badgeUrl ? <img src={club.badgeUrl} alt="" /> : null}
            <span className="team-picker-name" aria-hidden={club.badgeUrl ? "true" : undefined}>
              {club.shortName || club.name}
            </span>
            {club.badgeUrl ? <span className="visually-hidden">{club.name}</span> : null}
          </Link>
        ))}
      </nav>
      <nav className="fb-section-tabs team-sections" aria-label={t("Club sections")}>
        {(Object.keys(SECTION_LABELS) as TeamSection[]).map((section) => (
          <a
            key={section}
            href={`#${teamSectionId(section)}`}
            aria-current={current === section ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setReading(section);
              const next = new URLSearchParams(search);
              if (section === DEFAULT_SECTION) next.delete("section");
              else next.set("section", section);
              setSearch(next, { replace: true });
              document.getElementById(teamSectionId(section))?.focus();
            }}
          >
            <TeamSectionIcon section={section} />
            {t(SECTION_LABELS[section])}
          </a>
        ))}
      </nav>
      {index.isError && clubs.length === 0 ? (
        <LoadError message={t("The clubs could not be loaded.")} retrying={index.isFetching}
          onRetry={() => void index.refetch()} />
      ) : null}
      {dossier.isError && !dossier.data ? (
        <LoadError
          message={dossier.error instanceof ApiError && dossier.error.status === 404
            ? t("This club could not be found.")
            : t("The club could not be loaded.")}
          retrying={dossier.isFetching}
          onRetry={() => void dossier.refetch()}
        />
      ) : null}
      {index.isLoading || dossier.isLoading ? <TeamDossierLoading /> : null}
      {dossier.data ? (
        <TeamPerformanceSection
          performance={dossier.data.performance ?? null}
          clubs={clubs}
          competition={route.competition}
          window={route.window}
          failed={dossier.data.segmentErrors?.some(
            (error) => error.segment === "performance",
          ) ?? false}
          onCompetition={(competition) => replaceRoute({ competition })}
          onWindow={(window) => replaceRoute({ window })}
          onRetry={() => void dossier.refetch()}
        />
      ) : <EmptySection section="performance" loading={loading} loaded={dossier.data != null} />}
      <SegmentNotice
        retrying={dossier.isFetching}
        failed={dossier.data?.segmentErrors?.some((error) => error.segment === "roster") ?? false}
        onRetry={() => void dossier.refetch()}
      />
      {dossier.data?.roster ? (
        <TeamPlayersSection
          roster={dossier.data.roster}
          clubName={dossier.data.club.name}
          seasonStats={{
            data: seasonStats.data,
            loading: seasonStats.isPending && seasonStats.fetchStatus !== "idle",
            failed: seasonStats.isError,
            onRetry: () => void seasonStats.refetch(),
          }}
        />
      ) : <EmptySection section="players" loading={loading} loaded={dossier.data != null} />}
      {dossier.data && (dossier.data.prediction || predictionFailed(dossier.data)) ? (
        <TeamLineupSection
          prediction={dossier.data.prediction ?? null}
          squad={dossier.data.roster?.players ?? []}
          clubId={clubId}
          failed={predictionFailed(dossier.data)}
          returnTo={teamPath(clubId ?? "", { ...route, section: "lineup" })}
          onRetry={() => void dossier.refetch()}
        />
      ) : <EmptySection section="lineup" loading={loading} loaded={dossier.data != null} />}
      <SegmentNotice
        retrying={dossier.isFetching}
        failed={dossier.data?.segmentErrors?.some(
          (error) => error.segment === "news" || error.segment === "injuries",
        ) ?? false}
        onRetry={() => void dossier.refetch()}
      />
      {dossier.data && (dossier.data.news || dossier.data.injuries)
        ? (
          <TeamNewsInjuriesSection
            injuries={dossier.data.injuries ?? null}
            news={dossier.data.news ?? null}
            squad={dossier.data.roster?.players ?? []}
            returnTo={teamPath(clubId ?? "", { ...route, section: "news" })}
          />
        ) : <EmptySection section="news" loading={loading} loaded={dossier.data != null} />}
    </div>
  );
}

/**
 * The section being read: the last one whose top has passed the sticky bars.
 * Returns null above the first section so the route's section stays authoritative.
 */
function sectionInView(): TeamSection | null {
  const root = getComputedStyle(document.documentElement);
  const header = parseFloat(root.getPropertyValue("--app-header-height")) || 0;
  const nav = document.querySelector<HTMLElement>(".team-sections");
  const sticky = nav && getComputedStyle(nav).position === "sticky" ? nav.offsetHeight : 0;
  const offset = Math.max(parseFloat(root.scrollPaddingTop) || 0, header + sticky) + 24;
  let found: TeamSection | null = null;
  for (const section of TEAM_SECTIONS) {
    const element = document.getElementById(teamSectionId(section));
    if (element && element.getBoundingClientRect().top <= offset) found = section;
  }
  const bottomReached = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  if (bottomReached && window.scrollY > 0) return "news";
  return found;
}

/**
 * Before the dossier arrives a section is a skeleton. Once it has loaded, a section the
 * club has no data for keeps its heading and says so, so section links never land on a
 * blank area; without a dossier (failed load) it stays an empty anchor beside the error.
 */
function EmptySection({ section, loading, loaded }: {
  section: TeamSection; loading: boolean; loaded: boolean;
}) {
  if (loading) return <TeamSectionSkeleton section={section} />;
  const id = teamSectionId(section);
  if (!loaded) return <section id={id} tabIndex={-1} />;
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="team-section-title">{t(SECTION_LABELS[section])}</h2>
      <p className="status-copy">{t("No information is available for this club yet.")}</p>
    </section>
  );
}

function predictionFailed(dossier: { segmentErrors?: { segment: string }[] }): boolean {
  return dossier.segmentErrors?.some((error) => error.segment === "prediction") ?? false;
}

function SegmentNotice({ failed, retrying, onRetry }: {
  failed: boolean; retrying: boolean; onRetry: () => void;
}) {
  if (!failed) return null;
  return <LoadError message={t("This section could not be loaded.")} retrying={retrying} onRetry={onRetry} />;
}

/** A failed request is announced, never drawn as an empty page. */
function LoadError({ message, retrying, onRetry }: {
  message: string; retrying: boolean; onRetry: () => void;
}) {
  return (
    <p role="alert">
      {message}
      <Button variant="outline" loading={retrying} loadingLabel={t("Retrying…")}
        onClick={onRetry}>{t("Retry")}</Button>
    </p>
  );
}
