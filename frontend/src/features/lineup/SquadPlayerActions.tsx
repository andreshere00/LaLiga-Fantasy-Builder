import { copy as localizeCopy, useLanguage } from "../../i18n";
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
import infoIcon from "../../assets/button_info.svg";
import infoRedIcon from "../../assets/button_info_red.svg";
import "./SquadPlayerActions.css";

type SaleView = "options" | "choose" | "list" | "modify" | "cancel" | "immediate";

const PLAYER_OPTIONS_HINT = "Click for player options";

function ChoiceGroup({ label, children }: {
  label: string;
  children: ReactNode;
}) {
  useLanguage();
  const titleId = useId();
  const items = Children.toArray(children);
  if (items.length === 0) return null;
  return (
    <section className="squad-sale-choice-group" aria-labelledby={titleId}>
      <h3 id={titleId} className="squad-sale-choice-group-label">{localizeCopy(label)}</h3>
      <div className="squad-sale-choices">{localizeCopy(items)}</div>
    </section>
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
  detailsReturnTo?: "/market" | "/players";
}) {
  useLanguage();
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
        {localizeCopy(typeof children === "function" ? children(() => {
          setView("options");
          setOpen(true);
        }) : children)}
        {!cardMenu ? <div className="squad-tile-controls">
          <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Help content={localizeCopy(triggerText ? null : PLAYER_OPTIONS_HINT)}>
              <Menu.Trigger ref={menuTrigger}
                className={"player-details-link squad-details-link" + (triggerText ? " is-text-trigger" : "")}
                aria-label={player.name + ", options"}>
                {localizeCopy(triggerText ?? <img src={menuOpen ? infoRedIcon : infoIcon} alt="" aria-hidden />)}
              </Menu.Trigger>
            </Help>
            <Menu.Portal><Menu.Positioner sideOffset={4} className="fb-menu-positioner">
              <Menu.Popup className="fb-menu-popup" aria-label={player.name + " options"}>
                <Menu.Item className="market-actions-item" onClick={() => {
                  menuTrigger.current?.focus(); setView("choose"); setOpen(true);
                }}>{localizeCopy("Market options")}</Menu.Item>
                {ownPlayer && offersMenu && !/^player-\d+$/.test(player.id) ? (
                  <Menu.Item className="market-actions-item" onClick={() => {
                    menuTrigger.current?.focus();
                    offersMenu.openForPlayer(player.id, player.name);
                  }}>{localizeCopy("View offers for this player")}</Menu.Item>
                ) : null}
                {player.masterPlayerId && player.positionId !== 5 ? (
                  <Menu.Item className="market-actions-item" render={<Link
                    to={"/players/" + encodeURIComponent(player.masterPlayerId)}
                    state={detailsReturnTo ? { returnTo: detailsReturnTo } : undefined} />}>
                    {localizeCopy("Player details")}</Menu.Item>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner></Menu.Portal>
          </Menu.Root>
        </div> : null}
      </div>
      {localizeCopy(opponentMarketOptions?.(open && view === "choose" && !ownPlayer, close))}
      <Dialog
        open={open && (ownPlayer || view !== "choose")}
        className={`squad-player-actions-dialog squad-player-actions-dialog--${view}`}
        title={
          (view === "choose" || view === "options")
            ? player.name
            : view === "list"
              ? "Bring to market"
              : view === "modify"
                ? "Modify bid"
                : view === "cancel"
                  ? "Cancel bid"
                  : "Send immediately to market"
        }
        onClose={close}
        closeOnBackdrop={!pending}
        footer={
          (view === "choose" || view === "options") ? (
            <button type="button" className="squad-sale-secondary" onClick={close}>
              {localizeCopy("Close")}</button>
          ) : (
            <>
              <button
                type="button"
                className="squad-sale-secondary"
                disabled={pending}
                onClick={() => setView("choose")}
              >
                {localizeCopy("Back")}</button>
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
                {localizeCopy(pending ? "Sending…" : view === "list" ? "List player" : view === "modify"
                  ? "Update listing" : view === "cancel" ? "Withdraw listing" : "Sell player now")}
              </button>
            </>
          )
        }
      >
        {view === "options" ? (
          <div className="squad-sale-choice-groups">
            <ChoiceGroup label={localizeCopy("Market")}>
              <button type="button" className="squad-sale-choice" onClick={() => setView("choose")}>
                {localizeCopy("Market options")}</button>
              {ownPlayer && offersMenu && !/^player-\d+$/.test(player.id) ? (
                <button type="button" className="squad-sale-choice" onClick={() => {
                  offersMenu.openForPlayer(player.id, player.name);
                  close();
                }}>
                  {localizeCopy("View offers for this player")}</button>
              ) : null}
            </ChoiceGroup>
            <ChoiceGroup label={localizeCopy("Details")}>
              {player.masterPlayerId && player.positionId !== 5 ? (
                <Link
                  className="squad-sale-choice"
                  to={`/players/${encodeURIComponent(player.masterPlayerId)}`}
                  onClick={close}
                >
                  {localizeCopy("Player details")}</Link>
              ) : null}
            </ChoiceGroup>
            <ChoiceGroup label={localizeCopy("Lineup")}>
              {onSwap ? (
                <button type="button" className="squad-sale-choice" onClick={() => {
                  close();
                  onSwap();
                }}>
                  {localizeCopy("Swap player")}</button>
              ) : null}
            </ChoiceGroup>
          </div>
        ) : null}
        {view === "choose" ? (
          <div className="squad-sale-choices">
            {listed ? (
              <>
                <button
                  type="button"
                  className="squad-sale-choice"
                  disabled={cancelBlocked != null}
                  onClick={() => setView("cancel")}
                >
                  {localizeCopy("Cancel bid")}</button>
                <button
                  type="button"
                  className="squad-sale-choice"
                  disabled={priceBlocked != null || cancelBlocked != null}
                  onClick={() => setView("modify")}
                >
                  {localizeCopy("Modify bid")}</button>
              </>
            ) : (
              <button
                type="button"
                className="squad-sale-choice"
                disabled={priceBlocked != null}
                onClick={() => setView("list")}
              >
                {localizeCopy("Bring to market")}</button>
            )}
            <button
              type="button"
              className="squad-sale-choice"
              disabled={half == null || listed}
              onClick={() => setView("immediate")}
            >
              {localizeCopy("Send immediately to market")}</button>
            {priceBlocked && !listed ? <p className="squad-sale-note">{localizeCopy(priceBlocked)}</p> : null}
            {listed && cancelBlocked ? <p className="squad-sale-note">{localizeCopy(cancelBlocked)}</p> : null}
          </div>
        ) : null}
        {view === "cancel" ? (
          <>
            <p className="squad-sale-copy">
              {localizeCopy("Cancel the sale of ")}<strong>{player.name}</strong>{localizeCopy("? The player stays in your squad and offers on this listing are dropped.")}</p>
            {cancelError ? (
              <p className="squad-sale-error" role="alert">
                {localizeCopy(cancelError)}
              </p>
            ) : null}
          </>
        ) : null}
        {(view === "list" || view === "modify") && minimum != null ? (
          <>
            <p className="squad-sale-copy">
              {localizeCopy(view === "modify" ? "Change" : "List")} <strong>{player.name}</strong> {localizeCopy(" for a whole-euro offer of at least ")}{localizeCopy(formatEuro(minimum))}{localizeCopy(", and no more than")}{" "}
              {localizeCopy(formatEuro(MAX_LISTING_PRICE))}.
              {localizeCopy(view === "modify"
                ? " The current listing and its offers are replaced by this amount."
                : null)}
            </p>
            <label className="squad-sale-label" htmlFor={inputId}>
              {localizeCopy("Offer")}</label>
            <NumericCounterField
              id={inputId}
              value={rawPrice}
              ariaLabel="Listing offer in euros"
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
                {localizeCopy(view === "modify" ? modifyError : listError)}
              </p>
            ) : null}
          </>
        ) : null}
        {view === "immediate" && half != null ? (
          <>
            <p className="squad-sale-copy">
              {localizeCopy("Sell ")}<strong>{player.name}</strong> {localizeCopy(" now for ")}{localizeCopy(formatEuro(half))}{localizeCopy(", half of")}{" "}
              {localizeCopy(formatEuro(minimum))}{localizeCopy(". The money is added to your balance and the player leaves your squad.")}</p>
            {immediateError ? (
              <p className="squad-sale-error" role="alert">
                {localizeCopy(immediateError)}
              </p>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </>
  );
}
