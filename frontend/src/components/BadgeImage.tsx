import { useState, type ReactNode } from "react";
import { badgeSources, type ClubMedia } from "../api/clubMedia";

/** Try each source once, resetting failures when the source list changes. */
export function BadgeImage({ media, fallback = "–", className }: {
  media: ClubMedia | null;
  fallback?: ReactNode;
  className?: string;
}) {
  const sources = badgeSources(media?.badge, ...(media?.fallbackBadges ?? []));
  return <BadgeSources key={JSON.stringify(sources)} sources={sources} fallback={fallback} className={className} />;
}

function BadgeSources({ sources, fallback, className }: { sources: string[]; fallback: ReactNode; className?: string }) {
  const [index, setIndex] = useState(0);
  const source = sources[index];
  return source ? <img className={className} key={source} src={source} alt="" aria-hidden="true" decoding="async"
    onError={() => setIndex((current) => current + 1)} /> : <span aria-hidden="true">{fallback}</span>;
}
