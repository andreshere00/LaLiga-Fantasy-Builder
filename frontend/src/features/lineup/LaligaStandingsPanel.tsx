import { Popover } from "@base-ui/react/popover";
import { useId } from "react";
import { ApiContractError, ApiError } from "../../api/errors";
import { useCompetitionStandingsQuery } from "../../api/queries";
import type { CompetitionStandingsDto } from "../../api/schemas";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { ScrollArea } from "../../components/ui/ScrollArea";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/Table";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import "./StandingsPanels.css";

type StandingMatch = CompetitionStandingsDto["rows"][number]["last5Matches"][number];
const outcomes = {
  W: { label: "Win", variant: "success" },
  D: { label: "Draw", variant: "warning" },
  L: { label: "Loss", variant: "failure" },
} as const;
const columns = [
  ["#", "Ranking"], ["Team", "Team"], ["Pts", "Score (league points)"],
  ["W", "Matches won"], ["D", "Matches tied"], ["L", "Matches lost"],
  ["GF", "Goals scored"], ["GA", "Goals against"], ["GD", "Goals difference"],
  ["Last 5", "Last 5 matches"],
] as const;

function dateLabel(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function MatchResult({ match, teamName }: { match: StandingMatch; teamName: string }) {
  const outcome = outcomes[match.result];
  const description = `${outcome.label} against ${match.opponent.name}, ${match.venue}, ` +
    `${match.goalsFor}–${match.goalsAgainst}, ${dateLabel(match.kickoffAt)}`;
  return (
    <Popover.Root>
      <Popover.Trigger className="standing-form-trigger" aria-label={description}>
        <Badge variant={outcome.variant}>{match.result}</Badge>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="standing-match-positioner">
          <Popover.Popup className="standing-match-popup">
            <Popover.Title>{outcome.label} · {match.venue}</Popover.Title>
            <Popover.Description>
              {teamName} {match.goalsFor}–{match.goalsAgainst} {match.opponent.name}
              <time dateTime={match.kickoffAt}>{dateLabel(match.kickoffAt)}</time>
            </Popover.Description>
            <Popover.Close render={<Button variant="ghost" size="sm" />}>Close</Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function errorCopy(error: unknown): string {
  if (error instanceof ApiError && error.code === "standings_plan_unavailable") {
    return "The standings data provider does not cover this season.";
  }
  if (error instanceof ApiContractError || (error instanceof ApiError && error.status === 502)) {
    return "LALIGA standings are temporarily inconsistent. Try again later.";
  }
  if (error instanceof ApiError && error.status === 404) {
    return "LALIGA standings are not available for this competition or season.";
  }
  return "LALIGA standings are unavailable. Try again later.";
}

export function LaligaStandingsPanel() {
  const headingId = useId();
  const query = useCompetitionStandingsQuery();
  const data = query.data;
  const updatedAt = data?.sourceUpdatedAt ?? data?.fetchedAt;
  return (
    <Card className="standings-panel" role="region" aria-labelledby={headingId}>
      <CardHeader>
        <div className="standings-heading">
          <CardTitle id={headingId}>LALIGA standings</CardTitle>
          <Button variant="ghost" size="sm" shape="square" aria-label="Refresh LALIGA standings"
            aria-disabled={query.isFetching} aria-busy={query.isFetching || undefined}
            onClick={() => { if (!query.isFetching) void query.refetch(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7M20 12l-4-4" />
            </svg>
          </Button>
        </div>
        <p className="standings-meta">
          {data ? `${data.season}/${String(data.season + 1).slice(-2)} · ` : ""}Completed matches
        </p>
        {updatedAt ? <p className="standings-meta">
          {data?.sourceUpdatedAt ? "Source updated " : "Retrieved "}
          <time dateTime={updatedAt}>{dateLabel(updatedAt)}</time>
        </p> : null}
        <p className="standings-legend">W Win · D Draw · L Loss · Latest on the right</p>
        {query.isError ? <p className="standings-error" role="alert">
          {data ? "Refresh failed. Showing previously retrieved standings. " : ""}
          {errorCopy(query.error)}
        </p> : null}
      </CardHeader>
      <CardContent>
        <ScrollArea horizontal viewportProps={{ role: "region", "aria-label": "LALIGA standings table" }}>
          {data ? (
            <Table className="standings-table">
              <TableCaption className="standings-sr-only">
                LALIGA {data.season}/{String(data.season + 1).slice(-2)} standings from completed matches.
                Last five results run from oldest to newest.
              </TableCaption>
              <TableHeader><TableRow>
                {columns.map(([short, label]) => (
                  <TableHead key={label} aria-label={label}>{short}</TableHead>
                ))}
              </TableRow></TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.team.id}>
                    <TableCell>{row.position}</TableCell>
                    <TableHead scope="row" className="standing-club">
                      <span className="standing-club-content">
                        <span className="standing-club-badge" aria-hidden="true">
                          <ProfilePhoto url={row.team.badgeUrl} fallback={row.team.name.slice(0, 2)} />
                        </span>
                        <span className="standing-club-name">{row.team.name}</span>
                      </span>
                    </TableHead>
                    <TableCell className="standing-points">{row.points}</TableCell>
                    <TableCell>{row.won}</TableCell><TableCell>{row.drawn}</TableCell>
                    <TableCell>{row.lost}</TableCell><TableCell>{row.goalsFor}</TableCell>
                    <TableCell>{row.goalsAgainst}</TableCell>
                    <TableCell>{row.goalDifference > 0 ? "+" : ""}{row.goalDifference}</TableCell>
                    <TableCell><div className="standing-form">
                      {row.last5Matches.length ? row.last5Matches.map((match) => (
                        <MatchResult key={match.matchId} match={match} teamName={row.team.name} />
                      )) : <span className="standings-meta">No completed matches</span>}
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : query.isError ? (
            <div className="standings-placeholder">
              <Button variant="outline" size="sm" loading={query.isFetching} loadingLabel="Retrying…"
                onClick={() => { void query.refetch(); }}>Retry standings</Button>
            </div>
          ) : <div className="standings-placeholder" role="status">Loading standings…</div>}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
