import type { ComponentProps, ReactNode } from "react";

/** Compatibility composition; rows have no entrance stagger or scale motion. */
export function MarketMotionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

type MarketRowMotionProps = ComponentProps<"li"> & { order: number };
export function MarketRowMotion({ order, className, children, ...props }: MarketRowMotionProps) {
  void order;
  return <li {...props} className={["market-row", "market-data-row", className].filter(Boolean).join(" ")}>{children}</li>;
}
