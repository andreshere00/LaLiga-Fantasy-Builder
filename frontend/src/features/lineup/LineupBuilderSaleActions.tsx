import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { t, useTranslation } from "../../i18n";
import { getJson, paths, postJson } from "../../api/client";
import { NeedsReauthError } from "../../api/errors";
import { formatEuro } from "../../api/format";
import { asFiniteNumber, asRecord, idText, text, type SquadCard } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Fields";
import { notify } from "../../components/ui/Notifications";
import { useLeague } from "./LeagueProvider";
import { leagueId } from "../../api/mappers";
import { immediateSalePrice, isValidListingPrice } from "./squadSale";
import { useSquadSales } from "./useSquadSales";

/** One sale the builder suggests; the manager confirms each one separately. */
export type BuilderSaleAction =
  | { kind: "accept_offer"; playerId: string; playerTeamId: string; name: string;
    amount: number; marketValue: number; offerId: string | null; marketId: string | null }
  | { kind: "immediate_sale"; playerId: string; playerTeamId: string; name: string;
    amount: number; marketValue: number }
  | { kind: "listing"; playerId: string; playerTeamId: string; name: string;
    amount: number; marketValue: number };

type ResolvedOffer = { id: string; marketId: string; money: number };

/** Re-read the squad entry's offers and keep the planned one only if still pending and as high. */
export function resolvePlannedOffer(
  payload: unknown, action: Extract<BuilderSaleAction, { kind: "accept_offer" }>,
  fallbackMarketId: string | null, now: number,
): ResolvedOffer | null {
  const offers = asRecord(payload)?.offers;
  if (!Array.isArray(offers)) return null;
  const usable = offers.flatMap((value) => {
    const offer = asRecord(value);
    const id = idText(offer?.id);
    const marketId = idText(offer?.marketId) ?? fallbackMarketId;
    const money = asFiniteNumber(offer?.money);
    const expires = text(offer?.expirationDate);
    const expiresAt = expires ? Date.parse(expires) : null;
    if (!offer || !id || !marketId || money == null || !Number.isSafeInteger(money)
      || text(offer.status)?.toLowerCase() !== "pending"
      || (expiresAt != null && (!Number.isFinite(expiresAt) || expiresAt <= now))) return [];
    return [{ id, marketId, money }];
  });
  const planned = action.offerId ? usable.filter((offer) => offer.id === action.offerId) : usable;
  const best = planned.sort((a, b) => b.money - a.money)[0];
  return best && best.money >= action.amount ? best : null;
}

/** Single-action confirmation for an accepted offer, immediate sale or listing. */
export function LineupBuilderSaleActions({ action, squad, onClose, onDone }: {
  action: BuilderSaleAction;
  squad: readonly SquadCard[];
  onClose: () => void;
  /** Called after a write succeeded or ended with an uncertain result. */
  onDone: (action: BuilderSaleAction) => void;
}) {
  useTranslation();
  const { accessToken, markNeedsReauth } = useAuth();
  const { selected } = useLeague();
  const queryClient = useQueryClient();
  const sales = useSquadSales();
  const leagueKey = selected ? leagueId(selected) : "";
  const card = squad.find((entry) => entry.id === action.playerTeamId) ?? null;
  const currentValue = card?.marketValue ?? action.marketValue;
  const [price, setPrice] = useState(String(Math.max(action.amount, currentValue)));
  const [offer, setOffer] = useState<ResolvedOffer | null | "checking">(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const listingPrice = Number(price);
  // A second listing for the same squad entry would be rejected upstream.
  const alreadyListed = action.kind === "listing" && card?.listingId != null;

  async function refresh() {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["team", leagueKey] }),
      queryClient.refetchQueries({ queryKey: ["team-money", leagueKey] }),
      queryClient.refetchQueries({ queryKey: ["market", leagueKey] }),
      queryClient.invalidateQueries({ queryKey: ["market-offers", leagueKey] }),
    ]);
  }

  async function checkOffer() {
    if (action.kind !== "accept_offer" || !accessToken) return;
    setOffer("checking");
    setMessage(null);
    try {
      const payload = await getJson(paths.playerTeamOffers(leagueKey, action.playerTeamId), accessToken);
      const resolved = resolvePlannedOffer(payload, action, action.marketId ?? card?.listingId ?? null, Date.now());
      setOffer(resolved);
      if (!resolved) setMessage("The offer is no longer pending at this amount. Rebuild to update the plan.");
    } catch (error) {
      if (error instanceof NeedsReauthError) markNeedsReauth();
      setOffer(null);
      setMessage("The offer could not be checked. Try again.");
    }
  }

  async function confirm() {
    if (pending || !accessToken) return;
    setPending(true);
    setMessage(null);
    try {
      if (action.kind === "accept_offer") {
        if (!offer || offer === "checking") return;
        await postJson(paths.marketOfferResponse(leagueKey, offer.marketId, offer.id, "accept"),
          accessToken, { offerMoney: offer.money });
        notify("Offer accepted");
        await refresh();
      } else if (action.kind === "immediate_sale") {
        await sales.sellImmediately.mutateAsync(action.playerTeamId);
      } else {
        await sales.listPlayer.mutateAsync({ playerTeamId: action.playerTeamId, salePrice: listingPrice });
      }
      onDone(action);
      onClose();
    } catch (error) {
      if (error instanceof NeedsReauthError) markNeedsReauth();
      setMessage("The sale could not be confirmed. Your squad has been refreshed; check it before retrying.");
      await refresh();
      // The write may still have been applied: recompute draftability from the refreshed squad.
      onDone(action);
    } finally {
      setPending(false);
    }
  }

  const half = immediateSalePrice(currentValue);
  const title = action.kind === "accept_offer" ? t("Accept offer for {{0}}", { 0: action.name })
    : action.kind === "immediate_sale" ? t("Sell {{0}} now", { 0: action.name })
      : t("List {{0}} for sale", { 0: action.name });
  const ready = action.kind === "accept_offer" ? offer != null && offer !== "checking"
    : action.kind === "immediate_sale" ? half != null
      : !alreadyListed && isValidListingPrice(Number.isFinite(listingPrice) ? listingPrice : null, currentValue);
  return <Dialog open title={title} onClose={onClose} closeOnBackdrop={!pending}
    className="lineup-builder-dialog" footer={<>
      <Button variant="secondary" shape="square" disabled={pending} onClick={onClose}>{t("Cancel")}</Button>
      {action.kind === "accept_offer" && (offer == null || offer === "checking")
        ? <Button shape="square" disabled={offer === "checking"} onClick={() => void checkOffer()}>{t("Check offer")}</Button>
        : <Button shape="square" variant={action.kind === "immediate_sale" ? "destructive" : "default"}
          disabled={!ready || pending} onClick={() => void confirm()}>
          {action.kind === "accept_offer" ? t("Accept offer") : action.kind === "immediate_sale" ? t("Sell now") : t("List for sale")}
        </Button>}
    </>}>
    {action.kind === "accept_offer" && <>
      <p>{t("Accept the pending offer of {{0}} for {{1}}?", { 0: formatEuro(action.amount), 1: action.name })}</p>
      {action.amount < action.marketValue && <p role="note">{t("This offer is below the player's market value ({{0}}).", { 0: formatEuro(action.marketValue) })}</p>}
      {offer && offer !== "checking" && <p role="status">{t("Offer confirmed: {{0}}.", { 0: formatEuro(offer.money) })}</p>}
    </>}
    {action.kind === "immediate_sale" && <>
      <p>{t("Sell {{0}} to LaLiga for {{1}}?", { 0: action.name, 1: half == null ? "—" : formatEuro(half) })}</p>
      <p role="note">{t("Immediate sales pay half the current market value ({{0}}). This cannot be undone.", { 0: formatEuro(currentValue) })}</p>
    </>}
    {action.kind === "listing" && <label className="lineup-builder-field">
      <span>{t("Sale price (at least the market value of {{0}})", { 0: formatEuro(currentValue) })}</span>
      <Input inputMode="numeric" value={price} aria-label={t("Sale price")}
        onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ""))} />
      <small className="fb-helper">{t("Listing money only counts once someone makes an offer you accept.")}</small>
    </label>}
    {alreadyListed && <p role="note">{t("This player is already on the market. Cancel or change that listing from your squad.")}</p>}
    {message && <p role="alert">{t(message)}</p>}
  </Dialog>;
}
