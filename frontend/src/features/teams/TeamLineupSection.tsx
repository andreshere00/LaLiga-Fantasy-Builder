import { useMemo, useState } from "react";
import { t, useTranslation } from "../../i18n";
import { Link } from "react-router-dom";
import { PitchMarkings } from "../lineup/PitchMarkings";
import { usePlayersCatalogQuery } from "../../api/queries";
import type { ClubDossierDto } from "../../api/schemas";
import { MarketActionDialogs } from "../market/actions/MarketActionDialogs";
import { MarketActionMenu } from "../market/actions/MarketActionMenu";
import {
  resolveMarketActionOffers,
  type MarketActionContext,
} from "../market/actions/marketActions";
import { useMarketActions } from "../market/actions/useMarketActions";
import type { MarketRow } from "../market/model/row";
import { useMarketBoard } from "../market/useMarketBoard";
import { PlayerBookmarkButton } from "../players/PlayerBookmarkButton";
import { useScouting } from "../scouting/ScoutingProvider";
import { usePlayerOutlooks } from "../lineup/useSquadStats";
import { playerFormPresentation } from "../players/playerForm";
import {
  catalogNames,
  fieldPlayerPath,
  matchCatalogPlayer,
  matchRosterPlayer,
  orderedAlternatives,
  type PredictedPlayer,
} from "./teamLineup";
import { LineupCoach } from "./LineupCoach";
import { RecentPoints } from "./RecentPoints";
import { TeamMeter } from "./TeamMeter";
import { alternativeLines, pitchLineLabel, pitchLines } from "./teamPitch";
import { isStarterFlagged } from "./TeamPlayersSection";
import { useRecentPoints } from "./useRecentPoints";

type Prediction = NonNullable<ClubDossierDto["prediction"]>;
type Squad = readonly { playerId: string; name: string; points?: number | null }[];

/** A published XI name resolved to a Fantasy player when the club squad or catalog identifies one. */
type Entry = PredictedPlayer & { playerId: string | null; points: number | null };

type Outlook = {
  form?: { rating?: string | null } | null;
  startProbability?: { percent?: number | null } | null;
};

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
  const selected = starters.find((player) => player.name === picked) ?? starters[0] ?? null;
  const alternatives = orderedAlternatives(
    (prediction?.alternatives ?? []).map((player) => resolve(asPlayer(player))),
  );
  const detailIds = [selected, ...alternatives].flatMap((player) => player?.playerId ? [player.playerId] : []);
  const outlooks = usePlayerOutlooks(detailIds);
  const recent = useRecentPoints(detailIds);
  const rowProps = {
    returnTo,
    catalogLoading: catalogQuery.isLoading,
    rows: board.rows,
    ownedIds: ownedIds(board.ownSquadCards),
    teamId: board.callerTeamId,
    context,
    actions,
    favorites: scouting.favorites,
    favoritePending: scouting.pending,
    onFavorite: scouting.toggle,
    outlooks: outlooks.profiles,
    recent,
  };
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
          <LineupCoach prediction={prediction} />
          <div className="team-lineup-board">
            <div>
              <h3>{t("Starters")}</h3>
              <div className="team-pitch">
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
                          aria-pressed={selected?.name === player.name}
                          onClick={() => setPicked(player.name)}
                        >
                          {player.photoUrl
                            ? <img src={player.photoUrl} alt="" />
                            : <span className="team-xi-photo" aria-hidden="true" />}
                          <span>{player.name}</span>
                          <strong>
                            {player.probability == null ? "—" : `${player.probability}%`}
                          </strong>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              {selected ? (
                <ul className="team-xi team-xi-selected">
                  <PlayerRow selected player={selected} {...rowProps} />
                </ul>
              ) : null}
            </div>
            <div className="team-alternatives">
              <h3>{t("Alternatives")}</h3>
              {alternativeLines(alternatives).map((group) => (
                <div key={group.line}>
                  <h4>{t(pitchLineLabel(group.line))}</h4>
                  <ul className="team-xi">
                    {group.players.map((player) => (
                      <PlayerRow key={`${group.line}-${player.name}`} player={player} {...rowProps} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <MarketActionDialogs
        actions={actions}
        money={board.money}
        squadMarketValue={board.squadMarketValue}
      />
    </section>
  );
}

function PlayerRow({
  selected = false,
  player,
  returnTo,
  catalogLoading,
  rows,
  ownedIds,
  teamId,
  context,
  actions,
  favorites,
  favoritePending,
  onFavorite,
  outlooks,
  recent,
}: {
  selected?: boolean;
  player: Entry;
  returnTo: string;
  catalogLoading: boolean;
  rows: MarketRow[];
  ownedIds: ReadonlySet<string>;
  teamId: string | null;
  context: MarketActionContext;
  actions: ReturnType<typeof useMarketActions>;
  favorites: ReadonlySet<string>;
  favoritePending: boolean;
  onFavorite: (playerId: string) => void;
  outlooks: { get(playerId: string): unknown };
  recent: ReadonlyMap<string, readonly { matchweek: number | null; points: number | null }[]>;
}) {
  const playerId = player.playerId;
  const row = playerId == null ? null : rows.find((item) => item.playerId === playerId) ?? null;
  const offers = row ? resolveMarketActionOffers(row, context) : [];
  const owned = playerId != null && ownedIds.has(playerId);
  const outlook = playerId ? outlooks.get(playerId) as Outlook | undefined : undefined;
  const form = playerFormPresentation(outlook?.form?.rating);
  const likelihood = player.probability ?? outlook?.startProbability?.percent ?? null;
  const flagged = isStarterFlagged(likelihood);
  return (
    <li className={selected ? "team-xi-player is-selected" : "team-xi-player"}>
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
          {form ? (
            <span className="team-mvp-form" data-form={form.code}>
              <img className="is-light" src={form.icons.light} alt="" />
              <img className="is-dark" src={form.icons.dark} alt="" />
              {t(form.label)}
            </span>
          ) : null}
          {player.points != null ? <span><abbr title={t("Fantasy points this season")}>{t("FSYP")}</abbr> {player.points}</span> : null}
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
            showLabel={selected}
            pressed={favorites.has(playerId)}
            disabled={favoritePending}
            playerName={player.name}
            onToggle={() => onFavorite(playerId)}
          />
          {owned ? (
            <Link className="team-xi-field" to={fieldPlayerPath(playerId, teamId)}>
              {t("Field player")}
            </Link>
          ) : null}
          {row && offers.length > 0 ? (
            <MarketActionMenu row={row} context={context} actions={actions} />
          ) : null}
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
