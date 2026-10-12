import type { ReactNode } from "react";

/** Keeps the pitch composition stable without spring or scale motion. */
export function PitchMotionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function PitchTileMotion({ children }: {
  order: number;
  lift: boolean;
  children: ReactNode;
}) {
  return <div className="pitch-tile-motion">{children}</div>;
}
