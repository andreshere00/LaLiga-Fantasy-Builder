import { useId, type ReactNode } from "react";

type CurrentFixtureTooltipProps = {
  message: string | null;
  children: ReactNode;
};

/** Hover warning panel for the open matchweek (fixture pager and score pill). */
export function CurrentFixtureTooltip({ message, children }: CurrentFixtureTooltipProps) {
  const tooltipId = useId();
  if (message == null || message === "") {
    return children;
  }
  return (
    <div
      className="current-fixture-tooltip has-hover-tooltip-panel"
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      {children}
      <span
        id={tooltipId}
        className="hover-tooltip-panel is-align-start"
        role="tooltip"
      >
        {message}
      </span>
    </div>
  );
}
