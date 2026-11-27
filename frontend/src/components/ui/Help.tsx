import { Tooltip } from "@base-ui/react/tooltip";
import { cloneElement, useRef, useState, type ReactElement, type ReactNode } from "react";

/**
 * Short explanatory help available on hover, keyboard focus, Escape and, for help-only
 * triggers, a tap on touch screens (tap again or outside to close).
 */
export function Help({ children, content, className = "", trigger, tapToOpen = trigger == null }: {
  children: ReactNode; content: ReactNode; className?: string; trigger?: ReactElement;
  /** Toggle on touch tap. Off by default for custom triggers, which usually act on press. */
  tapToOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const touch = useRef(false);
  if (!content) return trigger ? cloneElement(trigger, undefined, children) : <span className={className}>{children}</span>;
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root open={open} onOpenChange={(next, details) => {
        // A touch tap is handled by the click below; ignore the press-close it also reports.
        if (!next && touch.current && details.reason === "trigger-press") return;
        setOpen(next);
      }}>
        <Tooltip.Trigger
          render={trigger ?? <span tabIndex={0} className={className} />}
          onPointerDown={(event) => { touch.current = event.pointerType === "touch"; }}
          onClick={() => { if (tapToOpen && touch.current) setOpen((value) => !value); }}
        >
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal><Tooltip.Positioner sideOffset={8} className="fb-help-positioner">
          <Tooltip.Popup className="fb-tooltip" role="tooltip">{content}</Tooltip.Popup>
        </Tooltip.Positioner></Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
