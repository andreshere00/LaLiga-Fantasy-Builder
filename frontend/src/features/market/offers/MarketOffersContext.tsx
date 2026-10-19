import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type MarketOffersTarget = { playerTeamId: string; playerName: string } | null;

type MarketOffersContextValue = {
  pendingOffers: { leagueKey: string; playerTeamIds: readonly string[] } | null;
  reportPendingOffers: (leagueKey: string, playerTeamIds: readonly string[]) => void;
  isOpen: boolean;
  target: MarketOffersTarget;
  openAll: () => void;
  openForPlayer: (playerTeamId: string, playerName: string) => void;
  close: () => void;
  finalFocus: () => HTMLElement | false;
};

const MarketOffersContext = createContext<MarketOffersContextValue | null>(null);

export function MarketOffersProvider({ children }: { children: ReactNode }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const [pendingOffers, setPendingOffers] = useState<MarketOffersContextValue["pendingOffers"]>(null);
  const reportPendingOffers = useCallback((leagueKey: string, playerTeamIds: readonly string[]) => {
    setPendingOffers((previous) => previous?.leagueKey === leagueKey
      && previous.playerTeamIds.length === playerTeamIds.length
      && previous.playerTeamIds.every((id, index) => id === playerTeamIds[index])
      ? previous : { leagueKey, playerTeamIds });
  }, []);
  const [view, setView] = useState<{ isOpen: boolean; target: MarketOffersTarget }>({
    isOpen: false,
    target: null,
  });
  const openAll = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setView({ isOpen: true, target: null });
  }, []);
  const openForPlayer = useCallback((playerTeamId: string, playerName: string) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setView({ isOpen: true, target: { playerTeamId, playerName } });
  }, []);
  const close = useCallback(() => setView({ isOpen: false, target: null }), []);
  const finalFocus = useCallback(() => returnFocus.current?.isConnected ? returnFocus.current : false, []);
  const value = useMemo(() => ({ ...view, pendingOffers, reportPendingOffers, openAll, openForPlayer, close, finalFocus }),
    [view, pendingOffers, reportPendingOffers, openAll, openForPlayer, close, finalFocus]);

  return <MarketOffersContext.Provider value={value}>{children}</MarketOffersContext.Provider>;
}

export function useMarketOffersMenu() {
  return useContext(MarketOffersContext);
}
