import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { getJson, paths } from "../../api/client";
import { NeedsReauthError } from "../../api/errors";
import { asLeagues, leagueId, type FantasyLeague } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";

const EMPTY_LEAGUES: FantasyLeague[] = [];

type LeagueContextValue = {
  leagues: FantasyLeague[];
  selected: FantasyLeague | null;
  selectLeague: (id: string) => void;
  isLoading: boolean;
  error: unknown;
};

const LeagueContext = createContext<LeagueContextValue | null>(null);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { status, accessToken, markNeedsReauth } = useAuth();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["leagues"],
    enabled: status === "ready" && accessToken != null,
    queryFn: async () => asLeagues(await getJson(paths.leagues(), tokenRef.current ?? "")),
  });

  useEffect(() => {
    if (query.error instanceof NeedsReauthError) markNeedsReauth();
  }, [query.error, markNeedsReauth]);

  const leagues = query.data ?? EMPTY_LEAGUES;
  const selected =
    leagues.find((league) => leagueId(league) === selectedId) ??
    leagues.find((league) => leagueId(league) !== "") ??
    null;

  const value = useMemo<LeagueContextValue>(
    () => ({
      leagues,
      selected,
      selectLeague: setSelectedId,
      isLoading: query.isLoading,
      error: query.error,
    }),
    [leagues, selected, query.isLoading, query.error],
  );

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeague(): LeagueContextValue {
  const value = useContext(LeagueContext);
  if (!value) throw new Error("useLeague must be used within LeagueProvider");
  return value;
}
