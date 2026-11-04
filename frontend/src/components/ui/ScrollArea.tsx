// Adapted from shadcn/ui's Base UI Scroll Area (MIT). See shadcn-LICENSE.md.
import { ScrollArea as Primitive } from "@base-ui/react/scroll-area";
import type { ComponentProps } from "react";
import "./StandingsPrimitives.css";

type ScrollAreaProps = ComponentProps<typeof Primitive.Root> & {
  viewportProps?: ComponentProps<typeof Primitive.Viewport>;
  horizontal?: boolean;
};

export function ScrollArea({
  className = "", children, viewportProps, horizontal = false, ...props
}: ScrollAreaProps) {
  return (
    <Primitive.Root data-slot="scroll-area" className={`fb-scroll-root ${className}`} {...props}>
      <Primitive.Viewport data-slot="scroll-area-viewport" className="fb-scroll-viewport"
        tabIndex={0} {...viewportProps}>
        {children}
      </Primitive.Viewport>
      <ScrollBar />
      {horizontal ? <ScrollBar orientation="horizontal" /> : null}
      <Primitive.Corner className="fb-scroll-corner" />
    </Primitive.Root>
  );
}

export function ScrollBar({
  className = "", orientation = "vertical", ...props
}: ComponentProps<typeof Primitive.Scrollbar>) {
  return (
    <Primitive.Scrollbar data-slot="scroll-area-scrollbar" orientation={orientation}
      className={`fb-scroll-bar ${className}`} {...props}>
      <Primitive.Thumb data-slot="scroll-area-thumb" className="fb-scroll-thumb" />
    </Primitive.Scrollbar>
  );
}
