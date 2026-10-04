import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STAGGER_SECONDS = 0.035;
const STAGGER_WINDOW_MS = 1_200;

const MarketStaggerContext = createContext(true);

/** Loads motion features for market rows, same stack as the lineup pitch. */
export function MarketMotionProvider({ children }: { children: ReactNode }) {
  const [staggering, setStaggering] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setStaggering(false), STAGGER_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <MarketStaggerContext.Provider value={staggering}>{children}</MarketStaggerContext.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}

type MarketRowMotionProps = {
  order: number;
  children: ReactNode;
};

/**
 * Market row entrance, matching pitch tiles.
 *
 * Rows present when the list mounts rise in sequence. A row that appears later
 * (a filter change) pops in without the stagger delay.
 */
export function MarketRowMotion({ order, children }: MarketRowMotionProps) {
  const staggering = useContext(MarketStaggerContext);
  return (
    <m.li
      className="market-row market-data-row"
      initial={staggering ? { opacity: 0, y: 14, scale: 0.94 } : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 26,
        delay: staggering ? order * STAGGER_SECONDS : 0,
      }}
    >
      {children}
    </m.li>
  );
}
