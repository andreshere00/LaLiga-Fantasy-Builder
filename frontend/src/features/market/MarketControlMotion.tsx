import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Link } from "react-router-dom";
import { m, type Transition } from "motion/react";

import { MARKET_ROW_HOVER_TRANSITION } from "./MarketRowMotion";

export const MARKET_CONTROL_HOVER_TRANSITION: Transition = MARKET_ROW_HOVER_TRANSITION;

export const MARKET_CONTROL_HOVER = {
  y: -2,
  scale: 1.035,
} as const;

export const MARKET_CONTROL_TAP = {
  scale: 0.97,
  y: 0,
} as const;

function controlMotionProps(inactive: boolean) {
  if (inactive) return {};
  return {
    whileHover: { ...MARKET_CONTROL_HOVER, transition: MARKET_CONTROL_HOVER_TRANSITION },
    whileTap: MARKET_CONTROL_TAP,
  };
}

function isControlInactive(
  disabled: boolean | undefined,
  ariaDisabled: boolean | "true" | "false" | undefined,
): boolean {
  return disabled === true || ariaDisabled === true || ariaDisabled === "true";
}

type MarketMotionButtonProps = ComponentPropsWithoutRef<typeof m.button>;

/** Market button with a smooth hover lift and press scale. */
export const MarketMotionButton = forwardRef<HTMLButtonElement, MarketMotionButtonProps>(
  function MarketMotionButton({ disabled, "aria-disabled": ariaDisabled, ...props }, ref) {
    const inactive = isControlInactive(disabled, ariaDisabled);
    return (
      <m.button
        ref={ref}
        disabled={disabled}
        aria-disabled={ariaDisabled}
        {...controlMotionProps(inactive)}
        {...props}
      />
    );
  },
);

const MotionLink = m.create(Link);

type MarketMotionLinkProps = ComponentPropsWithoutRef<typeof MotionLink>;

/** In-app link styled for the market with the same hover motion as buttons. */
export const MarketMotionLink = forwardRef<HTMLAnchorElement, MarketMotionLinkProps>(
  function MarketMotionLink(props, ref) {
    return <MotionLink ref={ref} {...controlMotionProps(false)} {...props} />;
  },
);
