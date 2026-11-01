import { useId } from "react";
import { pointsLabel, scoreWeekLabel, type RankingEntry } from "../../api/mappers";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { ScrollArea } from "../../components/ui/ScrollArea";
import { PersonIcon } from "../shell/icons";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import "./StandingsPanels.css";

type PlayersRankingPanelProps = {
  ranking: readonly RankingEntry[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  /** Latest finished matchweek. `0` hides the fixture column. */
  lastPlayedWeek?: number;
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
    ? `Fixture ${week} scores could not be refreshed.`
    : `Fixture ${week} scores are unavailable.`;
}

export function PlayersRankingPanel({
  ranking,
  selectedTeamId,
  onSelectTeam,
  lastPlayedWeek = 0,
  lastFixturePoints = null,
  lastFixtureUnavailable = false,
}: PlayersRankingPanelProps) {
  const headingId = useId();
  const showFixture = lastPlayedWeek >= 1;
  const loadingFixture = showFixture && lastFixturePoints == null && !lastFixtureUnavailable;
  return (
    <Card className="ranking-panel" role="region" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle id={headingId}>Players Ranking</CardTitle>
        {showFixture && lastFixtureUnavailable ? (
          <p className="ranking-fixture-notice" role="alert">
            {fixtureNotice(lastPlayedWeek, lastFixturePoints != null)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <ScrollArea viewportProps={{ role: "region", "aria-label": "Fantasy manager rankings" }}>
          <div className={showFixture ? "rank-table has-fixture" : "rank-table"}>
            {showFixture ? (
              <div className="rank-columns">
                <span />
                <span />
                <span />
                <span className="rank-fixture">{scoreWeekLabel(lastPlayedWeek)}</span>
                <span className="rank-points">Season</span>
              </div>
            ) : null}
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
                      <span className="rank-position">{row.position ?? "—"}</span>
                      <span className="avatar" aria-hidden="true">
                        <ProfilePhoto url={row.avatarUrl} fallback={<PersonIcon />} />
                      </span>
                      <span className="rank-name">{row.name}</span>
                      {fixture ? (
                        <span className="rank-fixture">
                          <span className="standings-sr-only">
                            {`Fixture ${lastPlayedWeek} ${fixture.spoken}`}
                          </span>
                          <span aria-hidden="true">{fixture.visual}</span>
                        </span>
                      ) : null}
                      <span className="rank-points">
                        {showFixture ? <span className="standings-sr-only">Season </span> : null}
                        {pointsLabel(row.points)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
