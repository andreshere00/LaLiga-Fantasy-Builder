import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STAGGER_SECONDS = 0.035;
const STAGGER_WINDOW_MS = 1_200;

const StaggerContext = createContext(true);

/** Loads the lightweight motion features and honours reduced-motion preferences. */
export function PitchMotionProvider({ children }: { children: ReactNode }) {
  const [staggering, setStaggering] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setStaggering(false), STAGGER_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <StaggerContext.Provider value={staggering}>{children}</StaggerContext.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}

type PitchTileMotionProps = {
  order: number;
  lift: boolean;
  children: ReactNode;
};

/**
 * Pitch tile entrance with an optional hover lift.
 *
 * Tiles present on load or team change rise in sequence; a tile that appears later
 * (a swapped player) pops in immediately.
 */
export function PitchTileMotion({ order, lift, children }: PitchTileMotionProps) {
  const staggering = useContext(StaggerContext);
  return (
    <m.div
      className="pitch-tile-motion"
      initial={
        staggering ? { opacity: 0, y: 14, scale: 0.94 } : { opacity: 0, scale: 0.8 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={lift ? { y: -4 } : undefined}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 26,
        delay: staggering ? order * STAGGER_SECONDS : 0,
      }}
    >
      {children}
    </m.div>
  );
}
