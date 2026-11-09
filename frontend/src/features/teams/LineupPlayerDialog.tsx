import { Link } from "react-router-dom";
import { t, useTranslation } from "../../i18n";
import { Dialog } from "../../components/ui/Dialog";
import { MarketActionMenu } from "../market/actions/MarketActionMenu";
import { resolveMarketActionOffers, type MarketActionContext } from "../market/actions/marketActions";
import type { MarketActionsApi } from "../market/actions/useMarketActions";
import type { MarketRow } from "../market/model/row";
import { PlayerBookmarkButton } from "../players/PlayerBookmarkButton";
import { LineupFormBadge } from "./LineupFormBadge";
import { RecentPoints } from "./RecentPoints";
import { TeamMeter } from "./TeamMeter";
import { fieldPlayerPath } from "./teamLineup";
import type { Entry, Outlook, RecentMap } from "./lineupTypes";
import { isStarterFlagged } from "./TeamPlayersSection";

/** Everything known about one published starter: facts first, then the actions. */
export function LineupPlayerDialog({
  player,
  onClose,
  returnTo,
  row,
  owned,
  teamId,
  context,
  actions,
  favorite,
  favoritePending,
  onFavorite,
  outlook,
  recent,
}: {
  player: Entry | null;
  onClose: () => void;
  returnTo: string;
  row: MarketRow | null;
  owned: boolean;
  teamId: string | null;
  context: MarketActionContext;
  actions: MarketActionsApi;
  favorite: boolean;
  favoritePending: boolean;
  onFavorite: (playerId: string) => void;
  outlook: Outlook | undefined;
  recent: RecentMap;
}) {
  useTranslation();
  const playerId = player?.playerId ?? null;
  const likelihood = player?.probability ?? outlook?.startProbability?.percent ?? null;
  const flagged = isStarterFlagged(likelihood);
  const offers = row ? resolveMarketActionOffers(row, context) : [];
  /** A market dialog replaces this one instead of stacking over it. */
  const handoff = {
    ...actions,
    openBid: (...args: Parameters<MarketActionsApi["openBid"]>) => { onClose(); actions.openBid(...args); },
    openClause: (...args: Parameters<MarketActionsApi["openClause"]>) => { onClose(); actions.openClause(...args); },
    openWithdraw: (...args: Parameters<MarketActionsApi["openWithdraw"]>) => { onClose(); actions.openWithdraw(...args); },
  } as MarketActionsApi;
  return (
    <Dialog
      open={player != null}
      title={player?.name ?? ""}
      onClose={onClose}
      className="team-detail-dialog"
      layout="sheet"
    >
      {player ? (
        <div className="team-detail">
          <div className="team-detail-head">
            {player.photoUrl
              ? <img src={player.photoUrl} alt="" />
              : <span className="team-xi-photo" aria-hidden="true" />}
            <dl className="team-detail-facts">
              <div className="is-lead" data-level={flagged ? "high" : undefined}>
                <dt>{t("Probability")}</dt>
                <dd>
                  <span className="team-detail-figure">{likelihood == null ? "—" : `${likelihood}%`}</span>
                  <TeamMeter percent={likelihood} tone={flagged ? "red" : undefined} />
                </dd>
              </div>
              <div>
                <dt>{t("Form")}</dt>
                <dd><LineupFormBadge rating={outlook?.form?.rating} />{outlook?.form?.rating ? null : "—"}</dd>
              </div>
              <div>
                <dt>{t("FSYP")}</dt>
                <dd><span className="team-detail-figure team-detail-figure--fsyp">{player.points ?? "—"}</span></dd>
              </div>
            </dl>
          </div>
          {playerId ? <RecentPoints entries={recent.get(playerId) ?? []} /> : null}
          {playerId ? (
            <div className="team-detail-actions">
              <Link
                className="team-detail-link"
                to={`/players/${encodeURIComponent(playerId)}`}
                state={{ returnTo }}
              >
                {t("Player details")}
              </Link>
              <PlayerBookmarkButton
                variant="quiet"
                showLabel
                pressed={favorite}
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
                <MarketActionMenu row={row} context={context} actions={handoff} />
              ) : null}
            </div>
          ) : (
            <p className="team-xi-status">{t("Details unavailable")}</p>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
