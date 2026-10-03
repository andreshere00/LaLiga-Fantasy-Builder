import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import type { ReactNode } from "react";

const STAGGER_SECONDS = 0.035;

/** Loads the lightweight motion features and honours reduced-motion preferences. */
export function PitchMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

type PitchTileMotionProps = {
  order: number;
  lift: boolean;
  children: ReactNode;
};

/** Staggered fade-and-rise entrance with an optional hover lift for a pitch tile. */
export function PitchTileMotion({ order, lift, children }: PitchTileMotionProps) {
  return (
    <m.div
      className="pitch-tile-motion"
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={lift ? { y: -4 } : undefined}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 26,
        delay: order * STAGGER_SECONDS,
      }}
    >
      {children}
    </m.div>
  );
}
