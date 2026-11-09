import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { t, useTranslation } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Skeleton } from "../../components/ui/Skeleton";
import { usePlayersCatalogQuery } from "../../api/queries";
import { catalogMediaByMasterId } from "../../api/mappers";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { PersonIcon } from "../shell/icons";
import type { ClubDossierDto } from "../../api/schemas";
import { usePlayerOutlooks } from "../lineup/useSquadStats";
import { positionAbbrev, positionLabel, positionTone } from "../market/positions";
import { LineupFsyp } from "./LineupFsyp";
import { TeamSummary } from "./TeamSummary";
import { widgetDescription } from "./teamSummaries";
import {
  hierarchyGroups, type HierarchyEntry, type HierarchyGroup,
} from "./teamHierarchy";

type Squad = NonNullable<ClubDossierDto["roster"]>["players"];

/**
 * Every player's squad role in one place. The roles come from the player profiles, one read each,
 * so nothing is requested until the list is first opened and the answers stay cached afterwards.
 */
export function TeamHierarchySection({ players, returnTo }: { players: Squad; returnTo: string }) {
  useTranslation();
  const [requested, setRequested] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const ids = useMemo(() => players.map((player) => player.playerId), [players]);
  const outlooks = usePlayerOutlooks(requested ? ids : []);
  const catalog = usePlayersCatalogQuery(requested);
  const media = useMemo(() => catalogMediaByMasterId(catalog.data), [catalog.data]);
  const loaded = ids.filter((id) => outlooks.profiles.get(id) !== undefined).length;
  const groups = useMemo(() => hierarchyGroups(players.map((player): HierarchyEntry => {
    const hierarchy = outlooks.profiles.get(player.playerId)?.hierarchy;
    return {
      playerId: player.playerId,
      name: player.name,
      positionId: player.positionId ?? null,
      points: player.points ?? null,
      hierarchy: hierarchy?.label ?? null,
      rank: hierarchy?.rank ?? null,
    };
  })), [players, outlooks.profiles]);
  const ready = requested && !outlooks.isLoading;
  if (players.length === 0) return null;
  return (
    <div className="team-block">
      <h3 id="team-hierarchy-title">{t("Hierarchy levels")}</h3>
      <TeamSummary id="team-summary-hierarchy" widget="hierarchy" />
      <p className="team-note">{t("Roles are read when you open the list.")}</p>
      {ready ? <LevelChips groups={groups} /> : null}
      <div className="team-hierarchy-actions">
        <Button
          ref={trigger}
          variant="outline"
          aria-haspopup="dialog"
          onClick={() => { setRequested(true); setOpen(true); }}
        >
          {t("View hierarchy levels")}
        </Button>
      </div>
      <Dialog
        open={open}
        title={t("Hierarchy levels")}
        description={widgetDescription("hierarchy")}
        onClose={() => setOpen(false)}
        className="team-hierarchy-dialog"
        layout="sheet"
        finalFocus={() => trigger.current ?? false}
      >
        {outlooks.isLoading ? (
          <LoadingLevels loaded={loaded} total={ids.length} />
        ) : (
          <div className="team-hier-groups">
            {groups.map((group) => (
              <LevelGroup key={group.label} group={group} media={media} returnTo={returnTo} />
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}

/** A compact tally of the levels under the heading, so the split is visible before opening. */
function LevelChips({ groups }: { groups: readonly HierarchyGroup[] }) {
  return (
    <ul
      className="team-hier-chips"
      aria-labelledby="team-hierarchy-title"
      aria-describedby="team-summary-hierarchy"
    >
      {groups.map((group) => (
        <li key={group.label} className="team-hier-chip">
          <img src={group.presentation.icon} alt=""
            className={group.presentation.neutral ? "is-neutral" : undefined} />
          <span>{t(group.label)}</span>
          <span className="team-count">{group.players.length}</span>
        </li>
      ))}
    </ul>
  );
}

/** Placeholder groups shaped like the finished list, with the progress announced once. */
function LoadingLevels({ loaded, total }: { loaded: number; total: number }) {
  return (
    <div className="team-hier-groups" aria-busy="true">
      <p className="team-note" role="status">
        {t("Loading roles: {{0}} of {{1}}.", { 0: loaded, 1: total })}
      </p>
      {[4, 6].map((rows, group) => (
        <div key={group} className="team-hier-group" aria-hidden="true">
          <div className="team-hier-title">
            <Skeleton className="team-hier-skeleton-icon" />
            <Skeleton className="team-hier-skeleton-title" />
          </div>
          <div className="team-hier-list">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="team-hier-player">
                <Skeleton className="team-hier-skeleton-photo" />
                <Skeleton className="team-hier-skeleton-name" />
                <Skeleton className="team-hier-skeleton-tag" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LevelGroup({ group, media, returnTo }: {
  group: HierarchyGroup;
  media: ReadonlyMap<string, { photoUrl: string | null }>;
  returnTo: string;
}) {
  const headingId = `team-hier-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="team-hier-group" aria-labelledby={headingId}>
      <h3 id={headingId} className="team-hier-title">
        <img src={group.presentation.icon} alt=""
          className={group.presentation.neutral ? "is-neutral" : undefined} />
        {t(group.label)}
        <span className="team-count">{group.players.length}</span>
      </h3>
      <ul className="team-hier-list">
        {group.players.map((player) => (
          <li key={player.playerId} className="team-hier-player">
            <ProfilePhoto
              className="team-hier-photo"
              url={media.get(player.playerId)?.photoUrl ?? null}
              fallback={<PersonIcon />}
            />
            <Link
              className="team-player-link"
              to={`/players/${encodeURIComponent(player.playerId)}`}
              state={{ returnTo }}
            >
              {player.name}
            </Link>
            {player.positionId != null ? (
              <span
                className={`team-pos team-pos--${positionTone(player.positionId)}`}
                title={positionLabel(player.positionId) ?? undefined}
              >
                {positionAbbrev(player.positionId)}
              </span>
            ) : null}
            <LineupFsyp points={player.points} />
          </li>
        ))}
      </ul>
    </section>
  );
}
