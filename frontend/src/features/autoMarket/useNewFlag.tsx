import { useCallback, useSyncExternalStore } from "react";
import { Badge } from "../../components/ui/Badge";
import { t, useTranslation } from "../../i18n";

const KEY = "lfb-auto-market-seen";
const listeners = new Set<() => void>();
// Storage can be blocked, so the session keeps its own answer too.
let seenInSession = false;

function isSeen(): boolean {
  if (seenInSession) return true;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether to flag Auto market as new for this browser; opening it once clears the flag. */
export function useAutoMarketNew() {
  const isNew = !useSyncExternalStore(subscribe, isSeen, () => true);
  const dismiss = useCallback(() => {
    seenInSession = true;
    try { localStorage.setItem(KEY, "1"); } catch { /* The flag only returns next visit. */ }
    listeners.forEach((listener) => listener());
  }, []);
  return { isNew, dismiss };
}

/** The visible "New!" marker; text, not colour, carries the meaning. */
export function NewFlag({ className = "" }: { className?: string }) {
  useTranslation();
  return <Badge variant="success" className={`auto-market-new ${className}`}>{t("New!")}</Badge>;
}

/** Test hook: forget that the flag was dismissed. */
export function resetAutoMarketNew() {
  seenInSession = false;
  try { localStorage.removeItem(KEY); } catch { /* Nothing stored. */ }
  listeners.forEach((listener) => listener());
}
