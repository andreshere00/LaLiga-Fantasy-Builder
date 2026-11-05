import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { leagueId } from "../../api/mappers";
import { useLeague } from "../lineup/LeagueProvider";
import { readFavoritePlayerIds } from "../players/favorites";
import { notify, notifyEvent } from "../../components/ui/Notifications";
import { t } from "../../i18n";
import { favoritesSchema, inboxSchema, resultSchema, scoutingPaths, scoutingRequest, watchSchema, type Watch } from "./client";

export const alertMessages = {
  market: "Player listed on the market",
  clause_soon: "Player clause unlocks soon",
  clause_available: "Player clause is available",
} as const;

function useScoutingState() {
  const { user, accessToken, status } = useAuth();
  const { selected } = useLeague();
  const league = selected ? leagueId(selected) : "";
  const owner = user?.userId ?? "";
  const token = accessToken ?? "";
  const enabled = !!owner && !!token && status === "ready";
  const queryClient = useQueryClient();
  const key = ["scouting", owner];
  const favoritesQuery = useQuery({
    queryKey: [...key, "favorites", league], enabled,
    queryFn: ({ signal }) => scoutingRequest(token, scoutingPaths.favorites(league), favoritesSchema, "GET", undefined, signal),
    refetchOnWindowFocus: true, refetchInterval: 60_000, refetchIntervalInBackground: false,
  });
  const inbox = useInfiniteQuery({
    queryKey: [...key, "inbox"], enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => scoutingRequest(token, scoutingPaths.inbox(pageParam), inboxSchema, "GET", undefined, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  });
  const panelScroll = useRef<Record<string, number>>({});
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const events = inbox.data?.pages[0]?.notifications;
    if (!events) return;
    if (seen.current) for (const event of events) {
      if (!seen.current.has(event.id) && !event.readAt) {
        notifyEvent(`${owner}:${event.id}`, `${event.playerName} · ${t(alertMessages[event.kind])} · ${event.leagueName}`);
      }
    }
    seen.current ??= new Set();
    for (const event of events) seen.current.add(event.id);
  }, [inbox.data, owner]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });
  const importMutation = useMutation({
    mutationFn: (ids: string[]) => scoutingRequest(token, scoutingPaths.import, resultSchema, "POST", { playerIds: ids }),
    onSuccess: () => {
      try {
        localStorage.removeItem(`lfb-player-favorites:${owner}`);
        localStorage.setItem(`lfb-favorites-imported:${owner}`, "1");
      } catch { /* The server union is idempotent if device storage is unavailable. */ }
      void invalidate();
    },
  });
  const importStarted = useRef(false);
  useEffect(() => {
    if (!enabled || !favoritesQuery.isSuccess || importStarted.current) return;
    let imported = false;
    try { imported = localStorage.getItem(`lfb-favorites-imported:${owner}`) === "1"; } catch { /* Import is idempotent. */ }
    if (imported) return;
    importStarted.current = true;
    const ids = [...readFavoritePlayerIds(owner)].filter(id => /^[0-9]{1,10}$/.test(id));
    importMutation.mutate(ids);
  }, [enabled, favoritesQuery.isSuccess, owner, importMutation]);

  const watchMutation = useMutation({
    mutationFn: ({ player, prefs }: { player: string; prefs: Watch }) => {
      if (!league) throw new Error("No league selected");
      return scoutingRequest(token, scoutingPaths.watch(league, player), resultSchema, "PUT", watchSchema.parse(prefs));
    },
    onSuccess: invalidate,
    onError: () => notify("Alert preferences could not be saved. Try again.", "error"),
  });
  const toggleMutation = useMutation({
    mutationFn: async ({ player, remove }: { player: string; remove: boolean }) => {
      await scoutingRequest(token, scoutingPaths.favorite(player), resultSchema, remove ? "DELETE" : "PUT");
      if (!remove && league) {
        try {
          await scoutingRequest(token, scoutingPaths.watch(league, player), resultSchema, "PUT", {
            marketAlert: true, clauseAlert: true, leadHours: 24,
          });
        } catch {
          notify("Favorite saved; alerts could not be activated. Retry in Favorites.", "error");
          return false;
        }
      }
      return true;
    },
    onSuccess: (complete, { remove }) => {
      if (complete) notify(remove ? "Player removed from favorites." : "Player added to favorites.");
      return invalidate();
    },
    onError: () => notify("Favorites could not be saved. Try again.", "error"),
  });
  const refresh = useMutation({
    mutationFn: () => scoutingRequest(token, scoutingPaths.refresh(league), resultSchema, "POST"),
    onSuccess: invalidate, onError: () => notify("Monitoring could not be refreshed. Try again.", "error"),
  });
  const read = useMutation({
    mutationFn: (id: string) => scoutingRequest(token, scoutingPaths.read(id), resultSchema, "PUT"),
    onSuccess: invalidate, onError: () => notify("The alert could not be marked as read.", "error"),
  });
  const favorites = useMemo(() => new Set(favoritesQuery.data?.favorites.map(item => item.playerId) ?? []), [favoritesQuery.data]);
  return {
    panelScroll, favorites, favoritesQuery, inbox, watchMutation, toggleMutation, refresh, read, importMutation,
    unread: inbox.data?.pages[0]?.unreadCount ?? 0,
    pending: toggleMutation.isPending || !favoritesQuery.isSuccess,
    toggle: (player: string) => toggleMutation.mutate({ player, remove: favorites.has(player) }),
    retryImport: () => importMutation.mutate([...readFavoritePlayerIds(owner)].filter(id => /^[0-9]{1,10}$/.test(id))),
  };
}

const Context = createContext<ReturnType<typeof useScoutingState> | null>(null);
function ScoutingSession({ children }: { children: ReactNode }) {
  const value = useScoutingState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function ScoutingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <ScoutingSession key={user?.userId ?? "anonymous"}>{children}</ScoutingSession>;
}
export function useScouting() {
  const context = useContext(Context);
  if (!context) throw new Error("ScoutingProvider required");
  return context;
}
