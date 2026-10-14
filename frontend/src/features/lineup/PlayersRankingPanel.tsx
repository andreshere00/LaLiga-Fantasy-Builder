import { useId } from "react";
import { pointsLabel, type RankingEntry } from "../../api/mappers";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { ScrollArea } from "../../components/ui/ScrollArea";
import { PersonIcon } from "../shell/icons";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import "./StandingsPanels.css";

type PlayersRankingPanelProps = {
  ranking: readonly RankingEntry[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
};

export function PlayersRankingPanel({
  ranking, selectedTeamId, onSelectTeam,
}: PlayersRankingPanelProps) {
  const headingId = useId();
  return (
    <Card className="ranking-panel" role="region" aria-labelledby={headingId}>
      <CardHeader><CardTitle id={headingId}>Players Ranking</CardTitle></CardHeader>
      <CardContent>
        <ScrollArea viewportProps={{ role: "region", "aria-label": "Fantasy manager rankings" }}>
          <ul className="rank-list">
            {ranking.map((row) => {
              const active = row.teamId === selectedTeamId;
              return (
                <li key={row.teamId}>
                  <button type="button" className={active ? "rank-row active" : "rank-row"}
                    aria-current={active ? "true" : undefined} disabled={!row.selectable}
                    onClick={() => onSelectTeam(row.teamId)}>
                    <span className="rank-position">{row.position ?? "—"}</span>
                    <span className="avatar" aria-hidden="true">
                      <ProfilePhoto url={row.avatarUrl} fallback={<PersonIcon />} />
                    </span>
                    <span className="rank-name">{row.name}</span>
                    <span className="rank-points">{pointsLabel(row.points)}</span>
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
