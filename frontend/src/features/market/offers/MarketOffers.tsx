import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { getJson, paths, postJson } from "../../../api/client";
import { ApiContractError, NeedsReauthError } from "../../../api/errors";
import { callerTeamId, leagueId, type SquadCard } from "../../../api/mappers";
import { formatEuro } from "../../../api/format";
import { useReauthOnError } from "../../../api/queries";
import { useAuth } from "../../../auth/AuthProvider";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { notify } from "../../../components/ui/Notifications";
import { useNow } from "../../../hooks/useNow";
import { useLeague } from "../../lineup/LeagueProvider";
import blackIcon from "../../../assets/icon_notification_black.svg";
import grayIcon from "../../../assets/icon_notification_gray.svg";
import whiteIcon from "../../../assets/icon_notification_white.svg";
import clockBlackIcon from "../../../assets/icon_clock_black.svg";
import clockGrayIcon from "../../../assets/icon_clock_gray.svg";
import clockRedIcon from "../../../assets/icon_clock_red.svg";
import { ONE_HOUR_MS, remainingLabel } from "../model/valueSeries";
import { receivedOffers, type ReceivedOffer } from "./receivedOffers";
import "./MarketOffers.css";

type Props = { cards: SquadCard[]; squadAvailable: boolean };

/** Remounts local confirmation state when the selected league changes. */
export function MarketOffers({ cards, squadAvailable }: Props) {
  const { selected } = useLeague();
  const id = selected ? leagueId(selected) : "";
  const teamId = selected ? callerTeamId(selected) : null;
  return <OffersPanel key={id} cards={cards} squadAvailable={squadAvailable}
    leagueKey={id} teamId={teamId} />;
}

function OffersPanel({ cards, squadAvailable, leagueKey, teamId }: Props & {
  leagueKey: string; teamId: string | null;
}) {
  const { accessToken, markNeedsReauth } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ReceivedOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const sending = useRef(false);
  const focusAfterResponse = useRef(false);
  const acceptanceTrigger = useRef<HTMLButtonElement | null>(null);
  const refreshButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!confirmation && acceptanceTrigger.current) {
      if (acceptanceTrigger.current.isConnected) acceptanceTrigger.current.focus();
      else refreshButton.current?.focus();
      acceptanceTrigger.current = null;
    }
  }, [confirmation]);
  const now = useNow();
  const players = cards.filter((card) => !/^player-\d+$/.test(card.id));
  const enabled = accessToken != null && leagueKey !== "";
  const queries = useQueries({
    queries: players.map((card) => ({
      queryKey: ["market-offers", leagueKey, card.id],
      enabled: enabled && squadAvailable,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchInterval: open ? 60_000 : false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getJson(paths.playerTeamOffers(leagueKey, card.id), accessToken ?? "", { signal }),
    })),
  });
  useReauthOnError(queries.map((query) => query.error));
  const loading = enabled && squadAvailable && queries.some((query) => query.isPending);
  const degraded = !squadAvailable || queries.some((query) => query.isError)
    || players.length !== cards.length;
  const offers = queries.flatMap((query, index) => receivedOffers(players[index], query.data, now))
    .filter((offer) => !answered.has(offer.key));
  const pendingCount = offers.filter((offer) => !offer.isBid && offer.status === "pending").length;
  const hasOffers = pendingCount > 0;
  const fetching = queries.some((query) => query.isFetching);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["market-offers", leagueKey] }),
      queryClient.invalidateQueries({ queryKey: ["market", leagueKey] }),
      queryClient.invalidateQueries({ queryKey: ["team", leagueKey, teamId] }),
      queryClient.invalidateQueries({ queryKey: ["team-money", leagueKey, teamId] }),
      queryClient.invalidateQueries({ queryKey: ["lineup", leagueKey, teamId] }),
      queryClient.invalidateQueries({ queryKey: ["leagues"] }),
    ]);
  }

  const response = useMutation({
    retry: false,
    mutationFn: async ({ offer, action }: { offer: ReceivedOffer; action: "accept" | "reject" }) => {
      if (!enabled || !offer.id || !offer.marketId || offer.unavailableReason
        || (offer.expiresAt != null && offer.expiresAt <= Date.now())) {
        throw new Error("This offer is no longer available.");
      }
      return postJson(paths.marketOfferResponse(leagueKey, offer.marketId, offer.id, action),
        accessToken ?? "", action === "accept" ? { offerMoney: offer.money } : undefined);
    },
    onSuccess: async (_data, { action, offer }) => {
      setAnswered((previous) => new Set([...previous, offer.key]));
      acceptanceTrigger.current = null;
      setConfirmation(null);
      setError(null);
      focusAfterResponse.current = true;
      notify(action === "accept" ? "Offer accepted" : "Offer rejected");
      await refresh();
    },
    onError: async (failure) => {
      if (failure instanceof NeedsReauthError) markNeedsReauth();
      const message = failure instanceof ApiContractError
        ? "The response could not be confirmed. Offers have been refreshed; check their status before retrying."
        : "The offer could not be answered. Refresh offers and try again.";
      setError(message);
      acceptanceTrigger.current = null;
      notify(message, "error");
      setConfirmation(null);
      focusAfterResponse.current = true;
      await refresh();
    },
    onSettled: () => { sending.current = false; },
  });
  useEffect(() => {
    if (!response.isPending && !fetching && focusAfterResponse.current) {
      refreshButton.current?.focus();
      focusAfterResponse.current = false;
    }
  }, [response.isPending, fetching]);

  function answer(offer: ReceivedOffer, action: "accept" | "reject") {
    if (sending.current || offer.unavailableReason) return;
    sending.current = true;
    setError(null);
    response.mutate({ offer, action });
  }

  function close() {
    if (sending.current) return;
    setOpen(false);
    setConfirmation(null);
    setError(null);
  }

  const freshConfirmation = confirmation
    ? offers.find((offer) => offer.key === confirmation.key && offer.money === confirmation.money
      && offer.sender === confirmation.sender && offer.marketId === confirmation.marketId)
    : null;

  return (
    <>
      <Button variant="outline" shape="square"
        className={`market-offers-trigger${hasOffers ? " has-offers" : ""}`}
        aria-label={`Market offers${pendingCount ? `, ${pendingCount} pending` : ""}${degraded ? ", incomplete" : ""}`}
        aria-haspopup="dialog" aria-expanded={open} disabled={!enabled}
        onClick={() => {
          setOpen(true);
          void queryClient.invalidateQueries({ queryKey: ["market-offers", leagueKey] });
        }}>
        <img className="market-offers-icon-light"
          src={hasOffers ? whiteIcon : !enabled || loading ? grayIcon : blackIcon} alt="" />
        <img className="market-offers-icon-dark"
          src={hasOffers ? whiteIcon : !enabled || loading ? grayIcon : whiteIcon} alt="" />
        <span className="market-offers-label">Offers</span>
        {pendingCount > 0 ? <span className="market-offers-count">{pendingCount}</span> : null}
      </Button>
      <Dialog open={open} title="Market offers" onClose={close} layout="sheet"
        className="market-offers-panel" closeOnBackdrop={!response.isPending}
        footer={<Button variant="outline" shape="square" onClick={close}
          disabled={response.isPending}>Close</Button>}>
        <p className="market-offers-intro">Received offers for your squad in this league.</p>
        <Button ref={refreshButton} variant="outline" shape="square" disabled={response.isPending || fetching}
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["market-offers", leagueKey] });
            if (!squadAvailable) void queryClient.invalidateQueries({ queryKey: ["team", leagueKey, teamId] });
          }}>
          Refresh offers
        </Button>
        {loading ? <p role="status">Loading offers…</p> : null}
        {degraded ? <p role="alert">Some offers could not be loaded. The list and count may be incomplete.</p> : null}
        {error ? <p className="market-offers-error" role="alert">{error}</p> : null}
        {confirmation && !offers.some((offer) => offer.key === confirmation.key) ? <div role="alert">
          <p>This offer is no longer available.</p>
          <Button autoFocus variant="outline" shape="square" disabled={response.isPending}
            onClick={() => setConfirmation(null)}>Cancel confirmation</Button>
        </div> : null}
        {!loading && !degraded && offers.length === 0 ? <div className="market-offers-empty">
          <img src={grayIcon} alt="" />
          <p>No pending offers.</p>
          <p>Offers from LaLiga and other managers will appear here.</p>
        </div> : null}
        <ul className="market-offers-list">
          {offers.map((offer) => <li key={offer.key} className="market-offer"
            aria-busy={response.isPending && response.variables?.offer.key === offer.key || undefined}>
            <div className="market-offer-player">
              {offer.player.photoUrl ? <img src={offer.player.photoUrl} alt="" /> : null}
              <div><h3>{offer.player.name}</h3><p>{offer.sender}</p></div>
            </div>
            <strong className="market-offer-money">{formatEuro(offer.money)}</strong>
            <p className={`market-offer-expiry${offer.expiresAt == null ? " is-unknown"
              : offer.expiresAt - now <= ONE_HOUR_MS ? " is-urgent" : ""}`}>
              <img src={offer.expiresAt == null ? clockGrayIcon
                : offer.expiresAt - now <= ONE_HOUR_MS ? clockRedIcon : clockBlackIcon} alt="" />
              {offer.expiresAt == null ? <span>Time left unavailable</span> : <span>
                Time left: <time dateTime={`PT${Math.max(0, Math.ceil((offer.expiresAt - now) / 1000))}S`}>
                  {offer.expiresAt - now < 60_000 ? "<1m" : remainingLabel(offer.expiresAt, now)}
                </time>
              </span>}
            </p>
            {offer.expiresAt != null ? <p>Expires <time dateTime={new Date(offer.expiresAt).toISOString()}>
              {new Date(offer.expiresAt).toLocaleString()}
            </time></p> : null}
            {offer.unavailableReason ? <p className="market-offer-unavailable">{offer.unavailableReason}</p> : null}
            {response.isPending && response.variables?.offer.key === offer.key
              ? <p role="status">Sending response…</p> : null}
            {confirmation?.key === offer.key ? <div className="market-offer-confirmation" role="group" aria-label="Confirm acceptance">
              <p>Sell <strong>{offer.player.name}</strong> to {offer.sender} for <strong>{formatEuro(confirmation.money)}</strong>?</p>
              {!freshConfirmation ? <p role="alert">The offer changed. Cancel and review it again.</p> : null}
              <div className="market-offer-actions">
                <Button autoFocus variant="outline" shape="square" disabled={response.isPending}
                  onClick={() => setConfirmation(null)}>Cancel</Button>
                <Button shape="square" loading={response.isPending} loadingLabel="Sending…"
                  disabled={!freshConfirmation || !!freshConfirmation.unavailableReason}
                  onClick={() => { if (freshConfirmation) answer(freshConfirmation, "accept"); }}>Confirm sale</Button>
              </div>
            </div> : null}
            <div className="market-offer-actions">
              <Button variant="outline" shape="square" disabled={response.isPending || confirmation != null || !!offer.unavailableReason}
                onClick={() => answer(offer, "reject")} aria-label={`Reject offer for ${offer.player.name} from ${offer.sender}`}>Reject</Button>
              <Button shape="square" disabled={response.isPending || confirmation != null || !!offer.unavailableReason}
                onClick={(event) => {
                  acceptanceTrigger.current = event.currentTarget;
                  setError(null);
                  setConfirmation(offer);
                }}
                aria-label={`Accept offer for ${offer.player.name} from ${offer.sender}`}>Accept</Button>
            </div>
          </li>)}
        </ul>
      </Dialog>
    </>
  );
}
