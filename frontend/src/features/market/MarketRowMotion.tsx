import {
  AnimatePresence,
  LazyMotion,
  LayoutGroup,
  MotionConfig,
  domMax,
  m,
  type Transition,
} from "motion/react";
import type { ReactNode } from "react";

export const MARKET_ROW_TRANSITION: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.85,
};

export const MARKET_ROW_EXIT_TRANSITION: Transition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
};

export const MARKET_TABLE_CROSSFADE: Transition = {
  duration: 0.22,
  ease: [0.4, 0, 0.2, 1],
};

/** Loads layout-aware motion features for the market table and filter panel. */
export function MarketMotionScope({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

type MarketRowMotionListProps = {
  children: ReactNode;
};

export function MarketRowMotionList({ children }: MarketRowMotionListProps) {
  return (
    <LayoutGroup id="market-rows">
      <AnimatePresence initial={false} mode="popLayout">
        {children}
      </AnimatePresence>
    </LayoutGroup>
  );
}

type MarketTablePresenceProps = {
  showTable: boolean;
  emptyState: ReactNode;
  table: ReactNode;
};

/** Crossfades between the empty-filter message and the listings table. */
export function MarketTablePresence({ showTable, emptyState, table }: MarketTablePresenceProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {showTable ? (
        <m.div
          key="market-table-wrap"
          className="market-table-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MARKET_TABLE_CROSSFADE}
        >
          {table}
        </m.div>
      ) : (
        <m.div
          key="market-empty-wrap"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={MARKET_TABLE_CROSSFADE}
        >
          {emptyState}
        </m.div>
      )}
    </AnimatePresence>
  );
}
