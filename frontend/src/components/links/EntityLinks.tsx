import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { teamsClubId, teamsClubIdFromName } from "../../api/clubMedia";
import { clubTeamPath } from "../../features/teams/teamRoutes";
import "./entityLinks.css";

type LinkProps = { className?: string; children: ReactNode };

function classes(base: string, extra?: string): string {
  return [base, extra].filter(Boolean).join(" ");
}

/** A club name or crest that opens the club on Teams; plain text when the club is unknown. */
export function ClubLink({ teamId, badgeUrl, name, className, children }: LinkProps & {
  teamId?: unknown; badgeUrl?: string | null; name?: string | null;
}) {
  const clubId = teamsClubId(teamId, badgeUrl) ?? teamsClubIdFromName(name);
  if (!clubId) return <span className={className}>{children}</span>;
  return <Link className={classes("entity-link", className)} to={clubTeamPath(clubId)}>{children}</Link>;
}

/** A player name that opens the player's details; plain text without an id. */
export function PlayerLink({ playerId, returnTo, className, children }: LinkProps & {
  playerId?: string | number | null; returnTo?: string;
}) {
  if (playerId == null || playerId === "") return <span className={className}>{children}</span>;
  return (
    <Link className={classes("entity-link", className)} to={`/players/${encodeURIComponent(String(playerId))}`}
      state={returnTo ? { returnTo } : undefined}>{children}</Link>
  );
}

/** A Fantasy manager that opens their lineup; plain text without a team id. */
export function ManagerLink({ teamId, className, children }: LinkProps & { teamId?: string | number | null }) {
  if (teamId == null || teamId === "") return <span className={className}>{children}</span>;
  return (
    <Link className={classes("entity-link", className)} to={`/?team=${encodeURIComponent(String(teamId))}`}>
      {children}
    </Link>
  );
}
