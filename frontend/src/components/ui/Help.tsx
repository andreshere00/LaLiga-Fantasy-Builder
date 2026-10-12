import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

/** Short explanatory help available on hover, keyboard focus and Escape. */
export function Help({ children, content, className = "" }: {
  children: ReactNode; content: ReactNode; className?: string;
}) {
  if (!content) return <span className={className}>{children}</span>;
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root>
        <Tooltip.Trigger render={<span tabIndex={0} className={className} />}>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal><Tooltip.Positioner sideOffset={8} className="fb-help-positioner">
          <Tooltip.Popup className="fb-tooltip">{content}</Tooltip.Popup>
        </Tooltip.Positioner></Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
