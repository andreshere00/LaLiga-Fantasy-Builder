import { useCallback, useSyncExternalStore } from "react";

/** Tracks a CSS media query. Returns false where `matchMedia` is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const list = window.matchMedia(query);
    list.addEventListener("change", notify);
    return () => list.removeEventListener("change", notify);
  }, [query]);
  const read = () => (
    typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches
  );
  return useSyncExternalStore(subscribe, read, () => false);
}
