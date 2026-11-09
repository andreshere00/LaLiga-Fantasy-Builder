import { useMemo } from "react";
import { t, useTranslation } from "../../i18n";
import type { ClubDossierDto } from "../../api/schemas";
import { usePlayerOutlooks } from "../lineup/useSquadStats";
import { matchRosterPlayer } from "./teamLineup";
import { TeamInjuryCard, type InjuryItem } from "./TeamInjuryCard";
import { TeamNewsFeed } from "./TeamNewsFeed";
import { TeamSummary } from "./TeamSummary";

type Roster = NonNullable<ClubDossierDto["roster"]>;
type Injuries = ClubDossierDto["injuries"];
type News = ClubDossierDto["news"];

export function TeamNewsInjuriesSection({ injuries, news, squad, returnTo }: {
  injuries: Injuries;
  news: News;
  squad: Roster["players"];
  returnTo: string;
}) {
  useTranslation();
  const matched = useMemo(() => (injuries?.items ?? []).map((item) => ({
    item,
    player: matchRosterPlayer(item.name, squad),
  })), [injuries, squad]);
  const outlooks = usePlayerOutlooks(
    matched.flatMap(({ player }) => (player ? [player.playerId] : [])),
  );
  const rows = useMemo(() => {
    const list = matched.map(({ item, player }) => ({
    item,
    playerId: player?.playerId ?? null,
    points: player?.points ?? null,
    hierarchy: player ? outlooks.profiles.get(player.playerId)?.hierarchy?.label ?? null : null,
    rank: player ? outlooks.profiles.get(player.playerId)?.hierarchy?.rank ?? null : null,
  }));
    // Hold the fetched order until every role has loaded so the cards do not jump.
    return outlooks.isLoading ? list : list.sort(byImportance);
  }, [matched, outlooks.profiles, outlooks.isLoading]);
  const injuredCount = injuries?.published ? injuries.items.length : 0;
  return (
    <section id="team-news" tabIndex={-1} aria-labelledby="team-news-title">
      <h2 id="team-news-title" className="team-section-title">{t("News & Injuries")}</h2>
      <div className="team-news-board">
        <div className="team-block team-injuries">
          <h3 id="team-injuries-title">
            {t("Injured players")}
            {injuredCount > 0 ? <span className="team-count">{injuredCount}</span> : null}
          </h3>
          <TeamSummary id="team-summary-injuries" widget="injuries" />
          <p className="team-note">{t("Most important players first.")}</p>
          <InjuryList injuries={injuries} rows={rows} loading={outlooks.isLoading}
            returnTo={returnTo} />
        </div>
        <div className="team-block team-news">
          <h3 id="team-news-block-title">{t("News")}</h3>
          <TeamSummary id="team-summary-news" widget="news" />
          <p className="team-note">{t("Status changes, lineups and call-ups, newest first.")}</p>
          {news
            ? <TeamNewsFeed events={news.items} summaryId="team-summary-news" />
            : null}
        </div>
      </div>
    </section>
  );
}

type Row = {
  item: InjuryItem;
  playerId: string | null;
  points: number | null;
  hierarchy: string | null;
  rank: number | null;
};

/** Squad role first (1 is the most important), then season points, then name. */
function byImportance(a: Row, b: Row): number {
  return (a.rank ?? Infinity) - (b.rank ?? Infinity)
    || (b.points ?? -1) - (a.points ?? -1)
    || a.item.name.localeCompare(b.item.name);
}

function InjuryList({ injuries, rows, loading, returnTo }: {
  injuries: Injuries;
  rows: Row[];
  loading: boolean;
  returnTo: string;
}) {
  if (!injuries) return null;
  if (!injuries.published) return <p>{t("Current injuries are not published for this club.")}</p>;
  if (injuries.items.length === 0) return <p>{t("No current injuries were published.")}</p>;
  return (
    <ul
      className="team-injury-list"
      aria-label={t("Injured players")}
      aria-describedby="team-summary-injuries"
    >
      {rows.map((row, index) => (
        <TeamInjuryCard key={`${row.item.name}-${row.item.startedOn ?? ""}`} item={row.item}
          index={index} playerId={row.playerId} points={row.points} hierarchy={row.hierarchy}
          hierarchyLoading={loading && row.playerId !== null} returnTo={returnTo} />
      ))}
    </ul>
  );
}
