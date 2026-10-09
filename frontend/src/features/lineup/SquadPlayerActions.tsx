import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatEuro, formatIntegerAmount, parseIntegerAmount } from "../../api/format";
import type { SquadCard } from "../../api/mappers";
import { Modal } from "../../components/Modal";
import "../../components/TooltipPanel.css";
import { NumericCounterField } from "../../components/NumericCounterField";
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

type SaleView = "choose" | "list" | "modify" | "cancel" | "immediate";

const PLAYER_OPTIONS_HINT = "Click for player options";

export function SquadPlayerActions({
  player,
  sales,
  children,
}: {
  player: SquadCard;
  sales: SquadSalesApi;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<SaleView>("choose");
  const [rawPrice, setRawPrice] = useState("");
  const inputId = useId();
  const hintId = useId();
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
        {children}
        <div className="squad-tile-controls">
          <button
            type="button"
            className="player-details-link squad-details-link"
            aria-label={`${player.name}, view details`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-describedby={hintId}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <img src={menuOpen ? infoRedIcon : infoIcon} alt="" aria-hidden />
            <span id={hintId} className="hover-tooltip-panel squad-player-hint" role="tooltip">
              {PLAYER_OPTIONS_HINT}
            </span>
          </button>
          {menuOpen ? (
            <div className="squad-info-menu" role="menu" aria-label={`${player.name} options`}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setView("choose");
                  setOpen(true);
                }}
              >
                Market options
              </button>
              {player.masterPlayerId ? (
                <Link
                  role="menuitem"
                  to={`/players/${encodeURIComponent(player.masterPlayerId)}`}
                  onClick={() => setMenuOpen(false)}
                >
                  Player details
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <Modal
        open={open}
        title={
          view === "choose"
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
          view === "choose" ? (
            <button type="button" className="squad-sale-secondary" onClick={close}>
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                className="squad-sale-secondary"
                disabled={pending}
                onClick={() => setView("choose")}
              >
                Back
              </button>
              <button
                type="button"
                className="squad-sale-primary"
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
                {pending ? "Sending…" : "Confirm"}
              </button>
            </>
          )
        }
      >
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
                  Cancel bid
                </button>
                <button
                  type="button"
                  className="squad-sale-choice"
                  disabled={priceBlocked != null || cancelBlocked != null}
                  onClick={() => setView("modify")}
                >
                  Modify bid
                </button>
              </>
            ) : (
              <button
                type="button"
                className="squad-sale-choice"
                disabled={priceBlocked != null}
                onClick={() => setView("list")}
              >
                Bring to market
              </button>
            )}
            <button
              type="button"
              className="squad-sale-choice"
              disabled={half == null || listed}
              onClick={() => setView("immediate")}
            >
              Send immediately to market
            </button>
            {priceBlocked && !listed ? <p className="squad-sale-note">{priceBlocked}</p> : null}
            {listed && cancelBlocked ? <p className="squad-sale-note">{cancelBlocked}</p> : null}
          </div>
        ) : null}
        {view === "cancel" ? (
          <>
            <p className="squad-sale-copy">
              Cancel the sale of <strong>{player.name}</strong>? The player stays in your squad
              and offers on this listing are dropped.
            </p>
            {cancelError ? (
              <p className="squad-sale-error" role="alert">
                {cancelError}
              </p>
            ) : null}
          </>
        ) : null}
        {(view === "list" || view === "modify") && minimum != null ? (
          <>
            <p className="squad-sale-copy">
              {view === "modify" ? "Change" : "List"} <strong>{player.name}</strong> for a
              whole-euro offer of at least {formatEuro(minimum)}, and no more than{" "}
              {formatEuro(MAX_LISTING_PRICE)}.
              {view === "modify"
                ? " The current listing and its offers are replaced by this amount."
                : null}
            </p>
            <label className="squad-sale-label" htmlFor={inputId}>
              Offer
            </label>
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
                {view === "modify" ? modifyError : listError}
              </p>
            ) : null}
          </>
        ) : null}
        {view === "immediate" && half != null ? (
          <>
            <p className="squad-sale-copy">
              Sell <strong>{player.name}</strong> now for {formatEuro(half)}, half of{" "}
              {formatEuro(minimum)}. The money is added to your balance and the player leaves
              your squad.
            </p>
            {immediateError ? (
              <p className="squad-sale-error" role="alert">
                {immediateError}
              </p>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}
