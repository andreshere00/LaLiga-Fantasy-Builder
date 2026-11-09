import { useMemo, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { t, useTranslation } from "../../i18n";
import { Link } from "react-router-dom";
import { PitchMarkings } from "../lineup/PitchMarkings";
import { usePlayersCatalogQuery } from "../../api/queries";
import type { ClubDossierDto } from "../../api/schemas";
import { MarketActionDialogs } from "../market/actions/MarketActionDialogs";
import type { MarketActionContext } from "../market/actions/marketActions";
import { useMarketActions } from "../market/actions/useMarketActions";
import { useMarketBoard } from "../market/useMarketBoard";
import { PlayerBookmarkButton } from "../players/PlayerBookmarkButton";
import { useScouting } from "../scouting/ScoutingProvider";
import { usePlayerOutlooks } from "../lineup/useSquadStats";
import {
  catalogNames,
  matchCatalogPlayer,
  matchRosterPlayer,
  orderedAlternatives,
  type PredictedPlayer,
} from "./teamLineup";
import { Button } from "../../components/ui/Button";
import { LineupCoach } from "./LineupCoach";
import { LineupFsyp } from "./LineupFsyp";
import { LineupFormBadge } from "./LineupFormBadge";
import { LineupPlayerDialog } from "./LineupPlayerDialog";
import { RecentPoints } from "./RecentPoints";
import { TeamMeter } from "./TeamMeter";
import { TeamSummary } from "./TeamSummary";
import { alternativesSummary, startersSummary } from "./teamSummaries";
import { alternativeLines, pitchLineLabel, pitchLines, type PitchLine } from "./teamPitch";
import { isStarterFlagged } from "./TeamPlayersSection";
import { useRecentPoints } from "./useRecentPoints";
import type { Entry, Outlook, RecentMap } from "./lineupTypes";

type Prediction = NonNullable<ClubDossierDto["prediction"]>;
type Squad = readonly { playerId: string; name: string; points?: number | null }[];

export function TeamLineupSection({
  prediction,
  squad = [],
  failed,
  returnTo,
  onRetry,
}: {
  prediction: Prediction | null;
  squad?: Squad;
  failed: boolean;
  returnTo: string;
  onRetry: () => void;
}) {
  useTranslation();
  const board = useMarketBoard();
  const actions = useMarketActions();
  const scouting = useScouting();
  const catalogQuery = usePlayersCatalogQuery(true);
  const catalog = useMemo(() => catalogNames(catalogQuery.data), [catalogQuery.data]);
  const context: MarketActionContext = {
    money: board.money,
    now: Date.now(),
    callerTeamId: board.callerTeamId,
    squadPlayerCount: board.squadPlayerCount,
    activeBidCount: board.activeBidCount,
    squadMarketValue: board.squadMarketValue,
  };
  const resolve = (player: PredictedPlayer): Entry => {
    const playerId = matchRosterPlayer(player.name, squad)?.playerId
      ?? matchCatalogPlayer(player.name, catalog);
    const points = squad.find((item) => item.playerId === playerId)?.points;
    return { ...player, playerId, points: points ?? null };
  };
  const starters = (prediction?.starters ?? []).map((player) => resolve(asPlayer(player)));
  const [picked, setPicked] = useState<string | null>(null);
  const selected = starters.find((player) => player.name === picked) ?? null;
  const alternatives = orderedAlternatives(
    (prediction?.alternatives ?? []).map((player) => resolve(asPlayer(player))),
  );
  const groups = alternativeLines(alternatives);
  const startersText = startersSummary(starters);
  /** Every line starts wrapped; opening one loads its players' form. */
  const [open, setOpen] = useState<ReadonlySet<PitchLine> | null>(null);
  const expanded = open ?? new Set<PitchLine>();
  const toggleLine = (line: PitchLine, next: boolean) => {
    const copy = new Set(expanded);
    if (next) copy.add(line);
    else copy.delete(line);
    setOpen(copy);
  };
  const allOpen = groups.length > 0 && groups.every((group) => expanded.has(group.line));
  // Form is read for the XI and for the lines that are open, so hidden rows cost nothing.
  const detailIds = [
    ...starters,
    ...groups.filter((group) => expanded.has(group.line)).flatMap((group) => group.players),
  ].flatMap((player) => player.playerId ? [player.playerId] : []);
  const outlooks = usePlayerOutlooks(detailIds).profiles;
  const recent = useRecentPoints(detailIds);
  const ownedSet = ownedIds(board.ownSquadCards);
  const selectedRow = selected?.playerId
    ? board.rows.find((item) => item.playerId === selected.playerId) ?? null
    : null;
  const outlookOf = (player: Entry) => player.playerId
    ? outlooks.get(player.playerId) as Outlook | undefined
    : undefined;
  return (
    <section id="team-lineup" tabIndex={-1} aria-labelledby="team-lineup-title">
      <h2 id="team-lineup-title" className="team-section-title">{t("Lineup")}</h2>
      {failed ? (
        <p role="alert">
          {t("This section could not be loaded.")}
          <button type="button" onClick={onRetry}>{t("Retry")}</button>
        </p>
      ) : null}
      {prediction == null ? (
        failed ? null : <p>{t("The predicted lineup is not published.")}</p>
      ) : (
        <>
          <div className="team-lineup-board">
            <div>
              <h3 id="team-starters-title">{t("Starters")}</h3>
              <TeamSummary id="team-summary-starters" text={startersText} />
              <p className="team-note">{t("Select a player for details and actions.")}</p>
              <div
                className="team-pitch"
                role="group"
                aria-labelledby="team-starters-title"
                aria-describedby={startersText ? "team-summary-starters" : undefined}
              >
                <PitchMarkings />
                <div className="team-pitch-rows">
                  {pitchLines(starters).map((line) => (
                    <div
                      key={line.line}
                      className="team-pitch-row"
                      role="group"
                      aria-label={t(pitchLineLabel(line.line))}
                    >
                      {line.players.map((player) => (
                        <button
                          key={player.name}
                          type="button"
                          className="team-pitch-player"
                          aria-haspopup="dialog"
                          onClick={() => setPicked(player.name)}
                        >
                          {player.photoUrl
                            ? <img src={player.photoUrl} alt="" />
                            : <span className="team-xi-photo" aria-hidden="true" />}
                          <span className="team-pitch-name">{player.name}</span>
                          <strong>
                            {player.probability == null ? "—" : `${player.probability}%`}
                          </strong>
                          <span className="team-pitch-meta">
                            <LineupFormBadge rating={outlookOf(player)?.form?.rating} iconOnly />
                            <LineupFsyp points={player.points} />
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="team-alternatives">
              <LineupCoach prediction={prediction} heading={t("Coach")} subtitle={t("How predictable the XI is for this matchday.")} />
              <div className="team-alternatives-head">
                <div className="team-alternatives-title">
                  <h3 id="team-alternatives-title">{t("Alternatives")}</h3>
                  <TeamSummary id="team-summary-alternatives" text={alternativesSummary(groups)} />
                  <p className="team-note">{t("Likeliest substitutes by position. Open a group to compare them.")}</p>
                </div>
                {groups.length > 1 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="team-alternatives-toggle"
                    icon={<span className="team-toggle-chevrons" data-open={allOpen ? "true" : undefined} />}
                    aria-expanded={allOpen}
                    onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((group) => group.line)))}
                  >
                    {allOpen ? t("Collapse all") : t("Expand all")}
                  </Button>
                ) : null}
              </div>
              {groups.map((group) => (
                <Collapsible.Root
                  key={group.line}
                  className="team-alt-group"
                  data-line={group.line}
                  open={expanded.has(group.line)}
                  onOpenChange={(next) => toggleLine(group.line, next)}
                >
                  <Collapsible.Trigger className="team-alt-trigger">
                    <span className="team-alt-title">{t(pitchLineLabel(group.line))}</span>
                    <span className="team-count">{group.players.length}</span>
                    <span className="team-alt-preview">
                      {expanded.has(group.line)
                        ? null
                        : group.players.slice(0, 2).map((player) => (
                          `${player.name} ${player.probability == null ? "—" : `${player.probability}%`}`
                        )).join(" · ")}
                    </span>
                    <span className="team-alt-chevron" aria-hidden="true" />
                  </Collapsible.Trigger>
                  <Collapsible.Panel>
                    <ul className="team-xi">
                      {group.players.map((player) => (
                        <AlternativeRow
                          key={`${group.line}-${player.name}`}
                          player={player}
                          outlook={outlookOf(player)}
                          recent={recent}
                          returnTo={returnTo}
                          catalogLoading={catalogQuery.isLoading}
                          favorite={player.playerId != null && scouting.favorites.has(player.playerId)}
                          favoritePending={scouting.pending}
                          onFavorite={scouting.toggle}
                        />
                      ))}
                    </ul>
                  </Collapsible.Panel>
                </Collapsible.Root>
              ))}
            </div>
          </div>
        </>
      )}
      <LineupPlayerDialog
        player={selected}
        onClose={() => setPicked(null)}
        returnTo={returnTo}
        row={selectedRow}
        owned={selected?.playerId != null && ownedSet.has(selected.playerId)}
        teamId={board.callerTeamId}
        context={context}
        actions={actions}
        favorite={selected?.playerId != null && scouting.favorites.has(selected.playerId)}
        favoritePending={scouting.pending}
        onFavorite={scouting.toggle}
        outlook={selected ? outlookOf(selected) : undefined}
        recent={recent as RecentMap}
      />
      <MarketActionDialogs
        actions={actions}
        money={board.money}
        squadMarketValue={board.squadMarketValue}
      />
    </section>
  );
}

function AlternativeRow({
  player,
  outlook,
  recent,
  returnTo,
  catalogLoading,
  favorite,
  favoritePending,
  onFavorite,
}: {
  player: Entry;
  outlook: Outlook | undefined;
  recent: RecentMap;
  returnTo: string;
  catalogLoading: boolean;
  favorite: boolean;
  favoritePending: boolean;
  onFavorite: (playerId: string) => void;
}) {
  const playerId = player.playerId;
  const likelihood = player.probability ?? outlook?.startProbability?.percent ?? null;
  const flagged = isStarterFlagged(likelihood);
  return (
    <li className="team-xi-player">
      {player.photoUrl
        ? <img src={player.photoUrl} alt="" />
        : <span className="team-xi-photo" aria-hidden="true" />}
      <div className="team-xi-name">
        {playerId ? (
          <Link
            className="team-player-link"
            to={`/players/${encodeURIComponent(playerId)}`}
            state={{ returnTo }}
          >
            {player.name}
          </Link>
        ) : <strong>{player.name}</strong>}
        <p className="team-xi-facts">
          <LineupFormBadge rating={outlook?.form?.rating} />
          <LineupFsyp points={player.points} />
          {!playerId && !catalogLoading ? <span className="team-xi-status">{t("Details unavailable")}</span> : null}
        </p>
      </div>
      <span className="team-xi-probability" data-level={flagged ? "high" : undefined}>
        <span className="visually-hidden">{t("Probability")} </span>
        <span>{likelihood == null ? "—" : `${likelihood}%`}</span>
        <TeamMeter percent={likelihood} tone={flagged ? "red" : undefined} />
      </span>
      {playerId ? <RecentPoints compact entries={recent.get(playerId) ?? []} /> : null}
      {playerId ? (
        <div className="team-xi-actions">
          <PlayerBookmarkButton
            variant="quiet"
            pressed={favorite}
            disabled={favoritePending}
            playerName={player.name}
            onToggle={() => onFavorite(playerId)}
          />
        </div>
      ) : null}
    </li>
  );
}

function ownedIds(cards: readonly { masterPlayerId: string | null }[]): Set<string> {
  return new Set(cards.flatMap((card) => card.masterPlayerId ? [card.masterPlayerId] : []));
}

function asPlayer(player: {
  name: string;
  photoUrl?: string | null;
  probability?: number | null;
  position?: string | null;
  profileUrl?: string | null;
}): PredictedPlayer {
  return {
    name: player.name,
    photoUrl: player.photoUrl ?? null,
    probability: player.probability ?? null,
    position: player.position ?? null,
    profileUrl: player.profileUrl ?? null,
  };
}
