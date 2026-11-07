import { t, useTranslation } from "../../i18n";
import { Link } from "react-router-dom";
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
import { PlayerDetailsLink } from "../players/PlayerDetailsLink";
import { ScrapedText } from "../translation/ScrapedText";
import { useScouting } from "../scouting/ScoutingProvider";
import {
  alternativesBySlot,
  catalogNames,
  fieldPlayerPath,
  matchCatalogPlayer,
  orderedAlternatives,
  type PredictedPlayer,
} from "./teamLineup";

type Prediction = NonNullable<ClubDossierDto["prediction"]>;

export function TeamLineupSection({
  prediction,
  failed,
  returnTo,
  onRetry,
}: {
  prediction: Prediction | null;
  failed: boolean;
  returnTo: string;
  onRetry: () => void;
}) {
  useTranslation();
  const board = useMarketBoard();
  const actions = useMarketActions();
  const scouting = useScouting();
  const catalogQuery = usePlayersCatalogQuery(true);
  const catalog = catalogNames(catalogQuery.data);
  const context: MarketActionContext = {
    money: board.money,
    now: Date.now(),
    callerTeamId: board.callerTeamId,
    squadPlayerCount: board.squadPlayerCount,
    activeBidCount: board.activeBidCount,
    squadMarketValue: board.squadMarketValue,
  };
  const favoriteFor = (name: string) => scouting.favorites.has(
    matchCatalogPlayer(name, catalog) ?? "",
  );
  const starters = (prediction?.starters ?? []).map(asPlayer);
  const alternatives = orderedAlternatives((prediction?.alternatives ?? []).map(asPlayer));
  const summary = prediction?.summary;
  return (
    <section id="team-lineup" tabIndex={-1} aria-labelledby="team-lineup-title">
      <h2 id="team-lineup-title" className="player-section-title">{t("Lineup")}</h2>
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
          {prediction.coach ? (
            <article className="team-coach">
              {prediction.coach.photoUrl ? <img src={prediction.coach.photoUrl} alt="" /> : null}
              <div>
                <h3>{prediction.coach.name}</h3>
                <dl>
                  <div>
                    <dt>{t("Matchday")}</dt>
                    <dd>{prediction.matchday ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("Rotations")}</dt>
                    <dd>
                      {prediction.coach.rotations
                        ? <ScrapedText text={prediction.coach.rotations} textId="club-rotations" />
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Predictability")}</dt>
                    <dd>{prediction.coach.matchdayPredictability ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("Season predictability")}</dt>
                    <dd>
                      {prediction.coach.seasonPredictabilityPercent == null
                        ? "—"
                        : `${prediction.coach.seasonPredictabilityPercent}%`}
                    </dd>
                  </div>
                </dl>
              </div>
            </article>
          ) : null}
          <h3>{t("Starters")}</h3>
          <ol className="team-xi">
            {starters.map((player) => (
              <PlayerRow
                key={`starter-${player.name}`}
                player={player}
                returnTo={returnTo}
                catalog={catalog}
                catalogLoading={catalogQuery.isLoading}
                rows={board.rows}
                ownedIds={ownedIds(board.ownSquadCards)}
                teamId={board.callerTeamId}
                context={context}
                actions={actions}
                favorite={favoriteFor(player.name)}
                favoritePending={scouting.pending}
                onFavorite={scouting.toggle}
              />
            ))}
          </ol>
          <h3>{t("Alternatives")}</h3>
          {alternativesBySlot(alternatives).map((group) => (
            <div key={group.position || "unassigned"}>
              <h4>{group.position || t("No slot")}</h4>
              <ul className="team-xi">
                {group.players.map((player) => (
                  <PlayerRow
                    key={`${group.position}-${player.name}`}
                    player={player}
                    returnTo={returnTo}
                    catalog={catalog}
                    catalogLoading={catalogQuery.isLoading}
                    rows={board.rows}
                    ownedIds={ownedIds(board.ownSquadCards)}
                    teamId={board.callerTeamId}
                    context={context}
                    actions={actions}
                    favorite={favoriteFor(player.name)}
                    favoritePending={scouting.pending}
                    onFavorite={scouting.toggle}
                  />
                ))}
              </ul>
            </div>
          ))}
          {summary && (
            summary.averageProbability != null
            || summary.averageFormArrow != null
            || summary.substituteRisk
          ) ? (
            <dl className="team-xi-summary">
              <div>
                <dt>{t("Average probability")}</dt>
                <dd>{summary.averageProbability ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("Average form")}</dt>
                <dd>{summary.averageFormArrow ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("Substitute risk")}</dt>
                <dd>
                  {summary.substituteRisk
                    ? <ScrapedText text={summary.substituteRisk} textId="club-xi-risk" />
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : null}
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
  player,
  returnTo,
  catalog,
  catalogLoading,
  rows,
  ownedIds,
  teamId,
  context,
  actions,
  favorite,
  favoritePending,
  onFavorite,
}: {
  player: PredictedPlayer;
  returnTo: string;
  catalog: ReturnType<typeof catalogNames>;
  catalogLoading: boolean;
  rows: MarketRow[];
  ownedIds: ReadonlySet<string>;
  teamId: string | null;
  context: MarketActionContext;
  actions: ReturnType<typeof useMarketActions>;
  favorite: boolean;
  favoritePending: boolean;
  onFavorite: (playerId: string) => void;
}) {
  const playerId = matchCatalogPlayer(player.name, catalog);
  const row = playerId == null ? null : rows.find((item) => item.playerId === playerId) ?? null;
  const offers = row ? resolveMarketActionOffers(row, context) : [];
  const owned = playerId != null && ownedIds.has(playerId);
  return (
    <li className="team-xi-player">
      {player.photoUrl
        ? <img src={player.photoUrl} alt="" />
        : <span className="team-xi-photo" aria-hidden="true" />}
      <div>
        <strong>{player.name}</strong>
        <p>
          {t("Probability")}
          <span>{player.probability == null ? "—" : `${player.probability}%`}</span>
        </p>
      </div>
      {playerId ? (
        <div className="team-xi-actions">
          <PlayerBookmarkButton
            pressed={favorite}
            disabled={favoritePending}
            playerName={player.name}
            onToggle={() => onFavorite(playerId)}
          />
          <PlayerDetailsLink playerId={playerId} playerName={player.name} returnTo={returnTo} />
          {owned ? (
            <Link to={fieldPlayerPath(playerId, teamId)}>
              {t("Field player")}
            </Link>
          ) : null}
          {row && offers.length > 0 ? (
            <MarketActionMenu
              row={row}
              context={context}
              actions={actions}
              detailsPlayer={{ id: playerId, name: player.name }}
              detailsReturnTo={returnTo}
            />
          ) : null}
        </div>
      ) : catalogLoading ? null : (
        <p>{t("Fantasy actions are unavailable for this player.")}</p>
      )}
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
