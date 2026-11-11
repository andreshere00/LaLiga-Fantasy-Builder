import { t, useTranslation } from "../../i18n";
import { Menu } from "@base-ui/react/menu";
import { Help } from "../../components/ui/Help";
import { Children, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatEuro, formatIntegerAmount, parseIntegerAmount } from "../../api/format";
import type { SquadCard } from "../../api/mappers";
import { Dialog } from "../../components/ui/Dialog";
import { NumericCounterField } from "../../components/NumericCounterField";
import { useMarketOffersMenu } from "../market/offers/MarketOffersContext";
import {
  LISTING_PRICE_STEP,
  MAX_LISTING_PRICE,
  clampListingPrice,
  immediateSalePrice,
  isValidListingPrice,
  minimumListingPrice,
  squadSaleErrorMessage,
} from "./squadSale";
import type { SquadSalesApi } from "./useSquadSales";
import { PlayerActionRow } from "./PlayerActionRow";
import { positionLabel } from "../market/positions";
import { teamsClubId } from "../../api/clubMedia";
import { clubTeamPath } from "../teams/teamRoutes";
import infoIcon from "../../assets/button_info.svg";
import infoRedIcon from "../../assets/button_info_red.svg";
import "./SquadPlayerActions.css";

type SaleView = "options" | "choose" | "list" | "modify" | "cancel" | "immediate";

const PLAYER_OPTIONS_HINT = "Click for player options";

function ChoiceGroup({ label, children }: {
  label: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const items = Children.toArray(children);
  if (items.length === 0) return null;
  return (
    <section className="squad-sale-choice-group" aria-labelledby={titleId}>
      <h3 id={titleId} className="squad-sale-choice-group-label">{label}</h3>
      <div className="squad-sale-choices">{items}</div>
    </section>
  );
}

/** Who the options are for: crest, position, value and listing state. */
function PlayerActionsSummary({ player }: { player: SquadCard }) {
  const position = positionLabel(player.positionId);
  const facts = [
    position,
    player.marketValue != null ? t("Value {{0}}", { 0: formatEuro(player.marketValue) }) : null,
  ].filter(Boolean);
  if (facts.length === 0 && !player.onMarket && !player.teamBadgeUrl) return null;
  return (
    <div className="player-actions-summary">
      {player.teamBadgeUrl ? (
        <img src={player.teamBadgeUrl} alt="" aria-hidden="true"
          onError={(event) => { event.currentTarget.hidden = true; }} />
      ) : null}
      <span>{facts.join(" · ")}</span>
      {player.onMarket ? (
        <span className="player-actions-chip">
          {player.salePrice != null
            ? t("Listed · {{0}}", { 0: formatEuro(player.salePrice) })
            : t("Listed")}
        </span>
      ) : null}
    </div>
  );
}

export function SquadPlayerActions({
  player,
  sales,
  children,
  triggerText,
  detailsReturnTo,
  cardMenu = false,
  ownPlayer = true,
  onSwap,
  opponentMarketOptions,
}: {
  player: SquadCard;
  sales: SquadSalesApi;
  children: ReactNode | ((openOptions: () => void) => ReactNode);
  cardMenu?: boolean;
  ownPlayer?: boolean;
  onSwap?: () => void;
  opponentMarketOptions?: (open: boolean, onClose: () => void) => ReactNode;
  triggerText?: string;
  detailsReturnTo?: string;
}) {
  useTranslation();
  const offersMenu = useMarketOffersMenu();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<SaleView>("choose");
  const [rawPrice, setRawPrice] = useState("");
  const inputId = useId();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const pending =
    sales.listPlayer.isPending ||
    sales.modifyListing.isPending ||
    sales.cancelListing.isPending ||
    sales.sellImmediately.isPending;
  const minimum = minimumListingPrice(player.marketValue);
  const clubId = teamsClubId(null, player.teamBadgeUrl);
  const half = immediateSalePrice(player.marketValue);
  const listed = player.onMarket;
  const priceBlocked = minimum == null ? "Market value is unavailable for this player." : null;
  const cancelBlocked =
    player.listingId == null ? "This listing could not be identified." : null;

  useEffect(() => {
    if (!open || minimum == null) return;
    if (view !== "list" && view !== "modify") return;
    const start = view === "modify" ? (player.salePrice ?? minimum) : minimum;
    setRawPrice(formatIntegerAmount(clampListingPrice(start, player.marketValue)));
  }, [open, view, minimum, player.id, player.marketValue, player.salePrice]);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setView("choose");
    sales.listPlayer.reset();
    sales.modifyListing.reset();
    sales.cancelListing.reset();
    sales.sellImmediately.reset();
  };

  const parsed = parseIntegerAmount(rawPrice);
  const priceValid = isValidListingPrice(parsed, player.marketValue);
  const listError = sales.listPlayer.error
    ? squadSaleErrorMessage(sales.listPlayer.error, "list")
    : null;
  const modifyError = sales.modifyListing.error
    ? squadSaleErrorMessage(sales.modifyListing.error, "modify")
    : null;
  const cancelError = sales.cancelListing.error
    ? squadSaleErrorMessage(sales.cancelListing.error, "cancel")
    : null;
  const immediateError = sales.sellImmediately.error
    ? squadSaleErrorMessage(sales.sellImmediately.error, "immediate")
    : null;

  const stepPrice = (current: number | null, deltaSteps: number) => {
    const base = current ?? minimum ?? 0;
    return clampListingPrice(base + deltaSteps * LISTING_PRICE_STEP, player.marketValue);
  };

  return (
    <>
      <div className="squad-tile-slot squad-player-hit-area">
        {typeof children === "function" ? children(() => {
          setView("options");
          setOpen(true);
        }) : children}
        {!cardMenu ? <div className="squad-tile-controls">
          <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Help content={triggerText ? null : t(PLAYER_OPTIONS_HINT)}>
              <Menu.Trigger ref={menuTrigger}
                className={"player-details-link squad-details-link" + (triggerText ? " is-text-trigger" : "")}
                aria-label={t("{{0}}, options", { 0: player.name })}>
                {(triggerText ?? <img src={menuOpen ? infoRedIcon : infoIcon} alt="" aria-hidden />)}
              </Menu.Trigger>
            </Help>
            <Menu.Portal><Menu.Positioner sideOffset={4} className="fb-menu-positioner">
              <Menu.Popup className="fb-menu-popup" aria-label={t("{{0}} options", { 0: player.name })}>
                <Menu.Item className="market-actions-item" onClick={() => {
                  menuTrigger.current?.focus(); setView("choose"); setOpen(true);
                }}>{t("Market options")}</Menu.Item>
                {ownPlayer && offersMenu && !/^player-\d+$/.test(player.id) ? (
                  <Menu.Item className="market-actions-item" onClick={() => {
                    menuTrigger.current?.focus();
                    offersMenu.openForPlayer(player.id, player.name);
                  }}>{t("View offers for this player")}</Menu.Item>
                ) : null}
                {player.masterPlayerId && player.positionId !== 5 ? (
                  <Menu.Item className="market-actions-item" render={<Link
                    to={"/players/" + encodeURIComponent(player.masterPlayerId)}
                    state={detailsReturnTo ? { returnTo: detailsReturnTo } : undefined} />}>
                    {t("Player details")}</Menu.Item>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner></Menu.Portal>
          </Menu.Root>
        </div> : null}
      </div>
      {opponentMarketOptions?.(open && view === "choose" && !ownPlayer, close)}
      <Dialog
        open={open && (ownPlayer || view !== "choose")}
        className={`squad-player-actions-dialog squad-player-actions-dialog--${view}`}
        title={(view === "choose" || view === "options") ? player.name : view === "list" ? t("Bring to market") : view === "modify" ? t("Modify bid") : view === "cancel" ? t("Cancel bid") : t("Send immediately to market")}
        onClose={close}
        closeOnBackdrop={!pending}
        footer={
          (view === "choose" || view === "options") ? (
            <button type="button" className="squad-sale-secondary" onClick={close}>
              {t("Close")}</button>
          ) : (
            <>
              <button
                type="button"
                className="squad-sale-secondary"
                disabled={pending}
                onClick={() => setView("choose")}
              >
                {t("Back")}</button>
              <button
                type="button"
                className="squad-sale-primary"
                aria-busy={pending || undefined}
                disabled={
                  pending ||
                  (view === "list" || view === "modify"
                    ? !priceValid || (view === "modify" && cancelBlocked != null)
                    : view === "cancel"
                      ? cancelBlocked != null
                      : half == null || listed)
                }
                onClick={() => {
                  if ((view === "list" || view === "modify") && parsed != null) {
                    const done = { onSuccess: () => close() };
                    if (view === "modify" && player.listingId != null) {
                      sales.modifyListing.mutate(
                        {
                          playerTeamId: player.id,
                          marketId: player.listingId,
                          salePrice: parsed,
                        },
                        done,
                      );
                      return;
                    }
                    sales.listPlayer.mutate(
                      { playerTeamId: player.id, salePrice: parsed },
                      done,
                    );
                    return;
                  }
                  if (view === "cancel" && player.listingId != null) {
                    sales.cancelListing.mutate(player.listingId, { onSuccess: () => close() });
                    return;
                  }
                  sales.sellImmediately.mutate(player.id, { onSuccess: () => close() });
                }}
              >
                {pending ? t("Sending…") : view === "list" ? t("List player") : view === "modify" ? t("Update listing") : view === "cancel" ? t("Withdraw listing") : t("Sell player now")}
              </button>
            </>
          )
        }
      >
        {view === "options" ? (
          <div className="squad-sale-choice-groups">
            <PlayerActionsSummary player={player} />
            <ChoiceGroup label={t("Market")}>
              <PlayerActionRow icon="euro_symbol" tone="market" label={t("Market options")}
                hint={listed ? t("Change the price or withdraw the listing") : t("List for sale or sell right away")}
                onClick={() => setView("choose")} />
              {ownPlayer && offersMenu && !/^player-\d+$/.test(player.id) ? (
                <PlayerActionRow icon="local_offer" tone="market" label={t("View offers for this player")}
                  hint={t("Offers other managers sent you")}
                  onClick={() => {
                    offersMenu.openForPlayer(player.id, player.name);
                    close();
                  }} />
              ) : null}
            </ChoiceGroup>
            <ChoiceGroup label={t("Details")}>
              {player.masterPlayerId && player.positionId !== 5 ? (
                <PlayerActionRow icon="account_circle" tone="details" label={t("Player details")}
                  hint={t("Stats, matches and market value history")}
                  to={`/players/${encodeURIComponent(player.masterPlayerId)}`}
                  state={detailsReturnTo ? { returnTo: detailsReturnTo } : undefined}
                  onClick={close} />
              ) : null}
              {clubId ? (
                <PlayerActionRow icon="groups" tone="details" label={t("Team page")}
                  hint={t("Squad, results and predicted lineup")}
                  to={clubTeamPath(clubId)}
                  onClick={close} />
              ) : null}
            </ChoiceGroup>
            <ChoiceGroup label={t("Lineup")}>
              {onSwap ? (
                <PlayerActionRow icon="swap_horiz" tone="lineup" label={t("Swap player")}
                  hint={t("Pick who takes this place in your lineup")}
                  onClick={() => {
                    close();
                    onSwap();
                  }} />
              ) : null}
            </ChoiceGroup>
          </div>
        ) : null}
        {view === "choose" ? (
          <div className="squad-sale-choices">
            <PlayerActionsSummary player={player} />
            {listed ? (
              <>
                <PlayerActionRow icon="edit" tone="market" label={t("Modify bid")}
                  hint={t(priceBlocked ?? cancelBlocked ?? "Set a new asking price")}
                  disabled={priceBlocked != null || cancelBlocked != null}
                  onClick={() => setView("modify")} />
                <PlayerActionRow icon="close" tone="danger" label={t("Cancel bid")}
                  hint={t(cancelBlocked ?? "Keep the player and drop the offers")}
                  disabled={cancelBlocked != null}
                  onClick={() => setView("cancel")} />
              </>
            ) : (
              <PlayerActionRow icon="local_offer" tone="market" label={t("Bring to market")}
                hint={priceBlocked ? t(priceBlocked) : minimum != null
                  ? t("Set your price, from {{0}}", { 0: formatEuro(minimum) }) : null}
                disabled={priceBlocked != null}
                onClick={() => setView("list")} />
            )}
            <PlayerActionRow icon="flash_on" tone="danger" label={t("Send immediately to market")}
              hint={listed ? t("Withdraw the listing first")
                : half != null ? t("Sell now for {{0}}", { 0: formatEuro(half) })
                  : t("Market value is unavailable for this player.")}
              disabled={half == null || listed}
              onClick={() => setView("immediate")} />
          </div>
        ) : null}
        {view === "cancel" ? (
          <>
            <p className="squad-sale-copy">
              {t("Cancel the sale of ")}<strong>{player.name}</strong>{t("? The player stays in your squad and offers on this listing are dropped.")}</p>
            {cancelError ? (
              <p className="squad-sale-error" role="alert">
                {t(cancelError)}
              </p>
            ) : null}
          </>
        ) : null}
        {(view === "list" || view === "modify") && minimum != null ? (
          <>
            <p className="squad-sale-copy">
              {view === "modify" ? t("Change") : t("List")} <strong>{player.name}</strong> {t(" for a whole-euro offer of at least ")}{formatEuro(minimum)}{t(", and no more than")}{" "}
              {formatEuro(MAX_LISTING_PRICE)}.
              {view === "modify" ? t(" The current listing and its offers are replaced by this amount.") : null}
            </p>
            <label className="squad-sale-label" htmlFor={inputId}>
              {t("Offer")}</label>
            <NumericCounterField
              id={inputId}
              value={rawPrice}
              ariaLabel={t("Listing offer in euros")}
              disabled={pending}
              formatInput={(raw) => {
                const amount = parseIntegerAmount(raw);
                if (amount == null) return raw;
                return formatIntegerAmount(clampListingPrice(amount, player.marketValue));
              }}
              parseValue={parseIntegerAmount}
              stepValue={stepPrice}
              onValueChange={setRawPrice}
              onBlur={() => {
                if (parsed == null) return;
                setRawPrice(formatIntegerAmount(clampListingPrice(parsed, player.marketValue)));
              }}
            />
            {listError || modifyError ? (
              <p className="squad-sale-error" role="alert">
                {view === "modify" ? modifyError : listError}
              </p>
            ) : null}
          </>
        ) : null}
        {view === "immediate" && half != null ? (
          <>
            <p className="squad-sale-copy">
              {t("Sell ")}<strong>{player.name}</strong> {t(" now for ")}{formatEuro(half)}{t(", half of")}{" "}
              {formatEuro(minimum)}{t(". The money is added to your balance and the player leaves your squad.")}</p>
            {immediateError ? (
              <p className="squad-sale-error" role="alert">
                {t(immediateError)}
              </p>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </>
  );
}
