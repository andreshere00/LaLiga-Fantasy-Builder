import { useEffect, useRef, useState } from "react";
import { t, useTranslation } from "../../i18n";
import {
  useClubDossierQuery, useClubIndexQuery, useClubRosterStatsQuery,
} from "../../api/queries";
import { useAuth } from "../../auth/AuthProvider";
import { GatePanel } from "../gates/GatePanel";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  initialClubId, TEAM_SECTIONS, teamPath, teamSearch, teamSectionId, type TeamSection,
} from "./teamRoutes";
import { TeamPlayersSection } from "./TeamPlayersSection";
import { TeamPerformanceSection } from "./TeamPerformanceSection";
import { TeamLineupSection } from "./TeamLineupSection";
import { TeamNewsInjuriesSection } from "./TeamNewsInjuriesSection";
import type { TeamRouteState } from "./teamRoutes";
import "./teams.css";

const SECTION_LABELS: Record<TeamSection, string> = {
  players: "Players",
  performance: "Performance",
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
  const restored = useRef<string | null>(null);
  useEffect(() => {
    // A deep link such as ?section=lineup lands on that section once the dossier is drawn.
    // Content above it (photos, radar chips) can still shift, so the jump repeats while the
    // page settles, unless the reader has already started scrolling.
    if (!dossier.data || restored.current === clubId) return undefined;
    restored.current = clubId;
    if (route.section === "players") return undefined;
    let cancelled = false;
    const stop = () => { cancelled = true; };
    const events = ["wheel", "touchstart", "keydown"] as const;
    for (const name of events) window.addEventListener(name, stop, { once: true, passive: true });
    const jump = () => {
      if (cancelled) return;
      const target = document.getElementById(teamSectionId(route.section));
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
  const selected = clubs.find((club) => String(club.clubId) === clubId);
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
      </header>
      <nav className="team-picker" aria-label={t("Choose a club")}>
        {clubs.map((club) => (
          <Link
            key={club.clubId}
            to={teamPath(club.clubId, route)}
            title={club.name}
            aria-current={String(club.clubId) === clubId ? "page" : undefined}
          >
            {club.badgeUrl ? <img src={club.badgeUrl} alt="" /> : null}
            <span className={club.badgeUrl ? "visually-hidden" : "team-picker-name"}>{club.name}</span>
          </Link>
        ))}
      </nav>
      <nav className="team-sections" aria-label={t("Club sections")}>
        {(Object.keys(SECTION_LABELS) as TeamSection[]).map((section) => (
          <a
            key={section}
            href={`#${teamSectionId(section)}`}
            aria-current={current === section ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setReading(section);
              const next = new URLSearchParams(search);
              if (section === "players") next.delete("section");
              else next.set("section", section);
              setSearch(next, { replace: true });
              document.getElementById(teamSectionId(section))?.focus();
            }}
          >{t(SECTION_LABELS[section])}</a>
        ))}
      </nav>
      {index.isLoading || dossier.isLoading
        ? <p className="team-note" role="status">{t("Loading the club dossier.")}</p>
        : null}
      <SegmentNotice
        failed={dossier.data?.segmentErrors?.some((error) => error.segment === "roster") ?? false}
        onRetry={() => void dossier.refetch()}
      />
      {dossier.data?.roster ? (
        <TeamPlayersSection
          roster={dossier.data.roster}
          seasonStats={{
            data: seasonStats.data,
            loading: seasonStats.isPending && seasonStats.fetchStatus !== "idle",
            failed: seasonStats.isError,
            onRetry: () => void seasonStats.refetch(),
          }}
        />
      ) : <section id="team-players" tabIndex={-1} />}
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
      ) : <section id="team-performance" tabIndex={-1} />}
      {dossier.data && (dossier.data.prediction || predictionFailed(dossier.data)) ? (
        <TeamLineupSection
          prediction={dossier.data.prediction ?? null}
          squad={dossier.data.roster?.players ?? []}
          failed={predictionFailed(dossier.data)}
          returnTo={teamPath(clubId ?? "", { ...route, section: "lineup" })}
          onRetry={() => void dossier.refetch()}
        />
      ) : <section id="team-lineup" tabIndex={-1} />}
      <SegmentNotice
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
        ) : <section id="team-news" tabIndex={-1} />}
    </div>
  );
}

/**
 * The section being read: the last one whose top has passed the sticky bars.
 * Returns null above the first section so the route's section stays authoritative.
 */
function sectionInView(): TeamSection | null {
  const offset = 140;
  let found: TeamSection | null = null;
  for (const section of TEAM_SECTIONS) {
    const element = document.getElementById(teamSectionId(section));
    if (element && element.getBoundingClientRect().top <= offset) found = section;
  }
  const bottomReached = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  if (bottomReached && window.scrollY > 0) return "news";
  return found;
}

function predictionFailed(dossier: { segmentErrors?: { segment: string }[] }): boolean {
  return dossier.segmentErrors?.some((error) => error.segment === "prediction") ?? false;
}

function SegmentNotice({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed) return null;
  return (
    <p role="alert">
      {t("This section could not be loaded.")}
      <button type="button" onClick={onRetry}>{t("Retry")}</button>
    </p>
  );
}
