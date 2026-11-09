import { t, useTranslation } from "../../i18n";
import { Skeleton } from "../../components/ui/Skeleton";
import { PulseRing } from "../../components/ui/PulseRing";
import { teamSectionId, type TeamSection } from "./teamRoutes";

const TITLES: Record<TeamSection, string> = {
  performance: "Performance",
  players: "Players",
  lineup: "Lineup",
  news: "News & Injuries",
};

/** One status line for the whole dossier: the spinner says it is working, the skeletons say where. */
export function TeamDossierLoading() {
  useTranslation();
  return (
    <div className="team-loading">
      <PulseRing size="md" label={t("Loading the club dossier.")} />
    </div>
  );
}

/** Club tiles shaped like the picker while the directory loads. */
export function TeamPickerSkeleton() {
  return (
    <div className="team-picker-skeleton" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="team-skeleton-tile" />)}
    </div>
  );
}

/**
 * A section that has not arrived yet. It keeps the real id, so a deep link or the tab bar still
 * lands here, and the real heading, so the page outline does not change when the content shows up.
 */
export function TeamSectionSkeleton({ section }: { section: TeamSection }) {
  useTranslation();
  const id = teamSectionId(section);
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} aria-busy="true">
      <h2 id={`${id}-title`} className="team-section-title">{t(TITLES[section])}</h2>
      <div className="team-skeleton" aria-hidden="true">
        {section === "performance" ? <PerformanceShape /> : null}
        {section === "players" ? <PlayersShape /> : null}
        {section === "lineup" ? <LineupShape /> : null}
        {section === "news" ? <NewsShape /> : null}
      </div>
    </section>
  );
}

function PerformanceShape() {
  return (
    <>
      <Skeleton className="team-skeleton-line is-wide" />
      <div className="team-skeleton-cards">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="team-skeleton-card" />)}
      </div>
      <div className="team-skeleton-rows">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="team-skeleton-row" />)}
      </div>
    </>
  );
}

function PlayersShape() {
  return (
    <>
      <div className="team-skeleton-cards">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="team-skeleton-card is-tall" />)}
      </div>
      <Skeleton className="team-skeleton-line" />
      <div className="team-skeleton-rows">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="team-skeleton-player">
            <Skeleton className="team-skeleton-photo" />
            <Skeleton className="team-skeleton-name" />
            <Skeleton className="team-skeleton-tag" />
          </div>
        ))}
      </div>
    </>
  );
}

function LineupShape() {
  return (
    <>
      <Skeleton className="team-skeleton-line" />
      <Skeleton className="team-skeleton-pitch" />
    </>
  );
}

function NewsShape() {
  return (
    <div className="team-skeleton-split">
      <div className="team-skeleton-rows">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="team-skeleton-card" />)}
      </div>
      <div className="team-skeleton-rows">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="team-skeleton-row" />)}
      </div>
    </div>
  );
}
