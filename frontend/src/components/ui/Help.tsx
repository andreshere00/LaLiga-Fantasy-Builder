import { Tooltip } from "@base-ui/react/tooltip";
import { cloneElement, type ReactElement, type ReactNode } from "react";

/** Short explanatory help available on hover, keyboard focus and Escape. */
export function Help({ children, content, className = "", trigger }: {
  children: ReactNode; content: ReactNode; className?: string; trigger?: ReactElement;
}) {
  if (!content) return trigger ? cloneElement(trigger, undefined, children) : <span className={className}>{children}</span>;
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root>
        <Tooltip.Trigger render={trigger ?? <span tabIndex={0} className={className} />}>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal><Tooltip.Positioner sideOffset={8} className="fb-help-positioner">
          <Tooltip.Popup className="fb-tooltip">{content}</Tooltip.Popup>
        </Tooltip.Positioner></Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
