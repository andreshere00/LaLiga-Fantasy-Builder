import { t, useTranslation } from "../../i18n";
import { useClubDossierQuery, useClubIndexQuery } from "../../api/queries";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { initialClubId, teamPath, teamSearch, teamSectionId, type TeamSection } from "./teamRoutes";
import { TeamPlayersSection } from "./TeamPlayersSection";
import { TeamPerformanceSection } from "./TeamPerformanceSection";
import { TeamLineupSection } from "./TeamLineupSection";
import { TeamNewsSection } from "./TeamNewsSection";
import type { TeamRouteState } from "./teamRoutes";
import "./teams.css";

const SECTION_LABELS: Record<TeamSection, string> = {
  players: "Players",
  performance: "Performance",
  lineup: "Lineup",
  news: "News",
};

export function TeamsPage({ opponentClubId = null }: { opponentClubId?: number | null }) {
  useTranslation();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const route = teamSearch(search);
  const index = useClubIndexQuery();
  const clubId = params.clubId ?? null;
  const dossier = useClubDossierQuery(clubId);
  const clubs = index.data?.clubs ?? [];
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
      <h1>{t("Teams")}</h1>
      <nav className="team-picker" aria-label={t("Choose a club")}>
        {clubs.map((club) => (
          <Link
            key={club.clubId}
            to={teamPath(club.clubId, route)}
            aria-current={String(club.clubId) === clubId ? "page" : undefined}
          >
            {club.badgeUrl ? <img src={club.badgeUrl} alt="" /> : null}
            {club.name}
          </Link>
        ))}
      </nav>
      <nav className="team-sections" aria-label={t("Club sections")}>
        {(Object.keys(SECTION_LABELS) as TeamSection[]).map((section) => (
          <a
            key={section}
            href={`#${teamSectionId(section)}`}
            aria-current={route.section === section ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              const next = new URLSearchParams(search);
              if (section === "players") next.delete("section");
              else next.set("section", section);
              setSearch(next, { replace: true });
              document.getElementById(teamSectionId(section))?.focus();
            }}
          >{t(SECTION_LABELS[section])}</a>
        ))}
      </nav>
      {index.isPending || dossier.isPending ? <p>{t("Loading the club dossier.")}</p> : null}
      {selected ? <h2>{selected.name}</h2> : null}
      <SegmentNotice
        failed={dossier.data?.segmentErrors?.some((error) => error.segment === "roster") ?? false}
        onRetry={() => void dossier.refetch()}
      />
      {dossier.data?.roster ? (
        <TeamPlayersSection roster={dossier.data.roster} injuries={dossier.data.injuries ?? null} />
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
          failed={predictionFailed(dossier.data)}
          returnTo={teamPath(clubId ?? "", { ...route, section: "lineup" })}
          onRetry={() => void dossier.refetch()}
        />
      ) : <section id="team-lineup" tabIndex={-1} />}
      <SegmentNotice
        failed={dossier.data?.segmentErrors?.some((error) => error.segment === "news") ?? false}
        onRetry={() => void dossier.refetch()}
      />
      {dossier.data?.news
        ? <TeamNewsSection news={dossier.data.news} />
        : <section id="team-news" tabIndex={-1} />}
    </div>
  );
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
