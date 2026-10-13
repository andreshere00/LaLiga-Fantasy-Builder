import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type MarketOffersTarget = { playerTeamId: string; playerName: string } | null;

type MarketOffersContextValue = {
  isOpen: boolean;
  target: MarketOffersTarget;
  openAll: () => void;
  openForPlayer: (playerTeamId: string, playerName: string) => void;
  close: () => void;
};

const MarketOffersContext = createContext<MarketOffersContextValue | null>(null);

export function MarketOffersProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<{ isOpen: boolean; target: MarketOffersTarget }>({
    isOpen: false,
    target: null,
  });
  const openAll = useCallback(() => setView({ isOpen: true, target: null }), []);
  const openForPlayer = useCallback((playerTeamId: string, playerName: string) => {
    setView({ isOpen: true, target: { playerTeamId, playerName } });
  }, []);
  const close = useCallback(() => setView({ isOpen: false, target: null }), []);
  const value = useMemo(() => ({ ...view, openAll, openForPlayer, close }),
    [view, openAll, openForPlayer, close]);

  return <MarketOffersContext.Provider value={value}>{children}</MarketOffersContext.Provider>;
}

export function useMarketOffersMenu() {
  return useContext(MarketOffersContext);
}
