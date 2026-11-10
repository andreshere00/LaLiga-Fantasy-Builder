import { lazy } from "react";

/** Code loaders per route; calling one early (hover, focus, touch) warms the chunk. */
const loaders = {
  "/market": () => import("../features/market/MarketPage"),
  "/players": () => import("../features/players/PlayersPage"),
  "/teams": () => import("../features/teams/TeamsPage"),
  "/player": () => import("../features/players/PlayerDetailPage"),
} as const;

export type PreloadableRoute = keyof typeof loaders;

export const MarketPage = lazy(() => loaders["/market"]().then((m) => ({ default: m.MarketPage })));
export const PlayersPage = lazy(() => loaders["/players"]().then((m) => ({ default: m.PlayersPage })));
export const TeamsPage = lazy(() => loaders["/teams"]().then((m) => ({ default: m.TeamsPage })));
export const PlayerDetailPage = lazy(
  () => loaders["/player"]().then((m) => ({ default: m.PlayerDetailPage })),
);

/** Starts downloading a route's code. Safe to call repeatedly; failures are ignored. */
export function preloadRoute(route: PreloadableRoute): void {
  void loaders[route]().catch(() => undefined);
}

/** Maps a link target to the route whose code it needs, if any. */
export function routeForPath(path: string): PreloadableRoute | null {
  const [first, second] = path.split(/[?#]/)[0].split("/").filter(Boolean);
  if (first === "players") return second ? "/player" : "/players";
  if (first === "market" || first === "teams") return `/${first}`;
  return null;
}

/** Event props that warm a link target's code on hover, keyboard focus or first touch. */
export function preloadHandlers(path: string) {
  const route = routeForPath(path);
  if (route == null) return {};
  const warm = () => preloadRoute(route);
  return { onPointerEnter: warm, onFocus: warm, onTouchStart: warm };
}
