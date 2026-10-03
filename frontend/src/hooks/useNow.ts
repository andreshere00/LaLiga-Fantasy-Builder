import { useEffect, useState } from "react";

/** Milliseconds since epoch, refreshed on a fixed interval (default 1 minute). */
export function useNow(tickMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);
  return now;
}
