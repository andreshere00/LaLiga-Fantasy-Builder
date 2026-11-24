import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useSearchParams } from "react-router-dom";
import { buttonVariants } from "../../components/ui/Button";
import { t, useTranslation } from "../../i18n";
import { AutoMarketPanel } from "../autoMarket/AutoMarketPanel";
import { useAutoMarket } from "../autoMarket/AutoMarketProvider";
import { NewFlag, useAutoMarketNew } from "../autoMarket/useNewFlag";
import { useScouting } from "../scouting/ScoutingProvider";
import type { SquadCard } from "../../api/mappers";
import type { MarketActionsApi } from "./actions/useMarketActions";
import { MarketBids } from "./bids/MarketBids";
import type { MarketBoard } from "./useMarketBoard";
import auctionIconUrl from "../../assets/auction-9367178.png";
import "./MarketOptions.css";

type Props = {
  board: MarketBoard;
  actions: MarketActionsApi;
  now: number;
  squad: readonly SquadCard[];
};

const menuIcon = <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" /></svg>;
const bookmarkIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>;
const autoIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" /></svg>;
const bidsIcon = <span className="market-auction-icon" style={{ maskImage: `url(${auctionIconUrl})` }} aria-hidden="true" />;

/** One menu for the market's personal tools: favorites, auto market and my bids. */
export function MarketOptions({ board, actions, now, squad }: Props) {
  useTranslation();
  const scouting = useScouting();
  const auto = useAutoMarket();
  const [params, setParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bidsOpen, setBidsOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const flag = useAutoMarketNew();
  const showNew = flag.isNew && auto != null;
  const bidCount = board.activeBids.bids.length;
  const bidsIncomplete = !board.activeBids.complete;
  const favorites = scouting.favorites.size;
  const unread = scouting.unread;
  const openFavorites = () => {
    const next = new URLSearchParams(params);
    next.set("scouting", "favorites");
    setParams(next, { replace: true });
  };
  return <>
    <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Menu.Trigger data-market-options-trigger="" data-scouting-trigger=""
        className={buttonVariants({ variant: "outline", className: "market-options-trigger" })}
        aria-label={unread > 0 ? t("Market options, {{0}} unread alerts", { 0: unread })
          : showNew ? t("Market options, new: Auto market") : t("Market options")}>
        <span className="fb-button-icon" aria-hidden="true">{menuIcon}</span>
        <span>
          {t("Market options")}
          <svg className="market-options-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </span>
        {unread > 0 ? <span className="scouting-unread" aria-hidden="true">{unread}</span>
          : showNew ? <NewFlag className="market-options-new" /> : null}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={6} className="fb-menu-positioner">
          <Menu.Popup className="fb-menu-popup market-options-popup" aria-label={t("Market options")}>
            <Menu.Item className="market-actions-item market-options-item" onClick={openFavorites}
              aria-label={`${t("Favorites")} (${favorites})${unread > 0 ? `, ${t("{{0}} unread alerts", { 0: unread })}` : ""}`}>
              <span className="market-options-icon">{bookmarkIcon}</span>
              <span className="market-options-label">{t("Favorites")}</span>
              <span className="market-options-count" aria-hidden="true">{favorites}</span>
            </Menu.Item>
            {auto ? <Menu.Item className="market-actions-item market-options-item" onClick={() => { flag.dismiss(); setAutoOpen(true); }}
              aria-label={`${t("Auto market, {{0}} active", { 0: auto.live.length })}${showNew ? `, ${t("New!")}` : ""}`}>
              <span className="market-options-icon">{autoIcon}</span>
              <span className="market-options-label">{t("Auto market")}{showNew ? <NewFlag /> : null}</span>
              <span className="market-options-count" aria-hidden="true">{auto.live.length}</span>
            </Menu.Item> : null}
            <Menu.Item className="market-actions-item market-options-item" onClick={() => setBidsOpen(true)}
              aria-label={t("My bids, {{0}} active{{1}}", { 0: bidCount, 1: bidsIncomplete ? t(", incomplete") : "" })}>
              <span className="market-options-icon">{bidsIcon}</span>
              <span className="market-options-label">{t("My bids")}</span>
              <span className="market-options-count" aria-hidden="true">{bidCount}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
    <AutoMarketPanel squad={squad} open={autoOpen} onOpenChange={setAutoOpen} showTrigger={false} />
    <MarketBids board={board} actions={actions} now={now} open={bidsOpen} onOpenChange={setBidsOpen} showTrigger={false} />
  </>;
}
