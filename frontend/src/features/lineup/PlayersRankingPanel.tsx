import { t, useTranslation } from "../../i18n";
import { useId } from "react";
import { pointsLabel, type RankingEntry } from "../../api/mappers";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Help } from "../../components/ui/Help";
import { ScrollArea } from "../../components/ui/ScrollArea";
import { PersonIcon } from "../shell/icons";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import "./StandingsPanels.css";

type PlayersRankingPanelProps = {
  ranking: readonly RankingEntry[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  /** Matchweek shown on the chip. `0` hides it. */
  fixtureWeek?: number;
  /** `null` while that week standing is still loading. */
  lastFixturePoints?: ReadonlyMap<string, number> | null;
  lastFixtureUnavailable?: boolean;
};

function fixtureFigure(points: number | null | undefined, loading: boolean): {
  visual: string;
  spoken: string;
} {
  if (loading) return { visual: "…", spoken: "Loading" };
  if (points == null) return { visual: "—", spoken: "Unavailable" };
  return { visual: String(points), spoken: String(points) };
}

function fixtureNotice(week: number, hasScores: boolean): string {
  return hasScores
    ? t("Fixture {{0}} scores could not be refreshed.", { 0: week })
    : t("Fixture {{0}} scores are unavailable.", { 0: week });
}

export function PlayersRankingPanel({
  ranking,
  selectedTeamId,
  onSelectTeam,
  fixtureWeek = 0,
  lastFixturePoints = null,
  lastFixtureUnavailable = false,
}: PlayersRankingPanelProps) {
  useTranslation();
  const headingId = useId();
  const showFixture = fixtureWeek >= 1;
  const loadingFixture = showFixture && lastFixturePoints == null && !lastFixtureUnavailable;
  return (
    <Card className="ranking-panel" role="region" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle id={headingId}>{t("Players Ranking")}</CardTitle>
        {showFixture && lastFixtureUnavailable ? (
          <p className="ranking-fixture-notice" role="alert">
            {fixtureNotice(fixtureWeek, lastFixturePoints != null)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <ScrollArea viewportProps={{ role: "region", "aria-label": t("Fantasy manager rankings") }}>
          <ul className="rank-list">
            {ranking.map((row) => {
              const active = row.teamId === selectedTeamId;
              const fixture = showFixture
                ? fixtureFigure(lastFixturePoints?.get(row.teamId), loadingFixture)
                : null;
              return (
                <li key={row.teamId}>
                  <button
                    type="button"
                    className={active ? "rank-row active" : "rank-row"}
                    aria-current={active ? "true" : undefined}
                    disabled={!row.selectable}
                    onClick={() => onSelectTeam(row.teamId)}
                  >
                    <span className="rank-position">{(row.position ?? t("—"))}</span>
                    <span className="avatar" aria-hidden="true">
                      <ProfilePhoto url={row.avatarUrl} fallback={<PersonIcon />} />
                    </span>
                    <span className="rank-identity">
                      <span className="rank-name">{row.name}</span>
                      {fixture ? (
                        <>
                          <span className="standings-sr-only">
                            {t("Fixture {{0}} {{1}}", { 0: fixtureWeek, 1: t(fixture.spoken) })}
                          </span>
                          <Help
                            content={t("Fixture {{0}}", { 0: fixtureWeek })}
                            trigger={<span className="rank-fixture" />}
                          >
                            <span aria-hidden="true">{fixture.visual}</span>
                          </Help>
                        </>
                      ) : null}
                    </span>
                    <span className="rank-points">
                      {showFixture ? <span className="standings-sr-only">{t("Season ")}</span> : null}
                      {pointsLabel(row.points)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
