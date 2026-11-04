// Adapted from shadcn/ui's Base UI Progress (MIT). See shadcn-LICENSE.md.
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type { ComponentProps } from "react";
import "./Progress.css";

type ProgressProps = Omit<ComponentProps<typeof ProgressPrimitive.Root>, "className"> & {
  className?: string;
};

export function Progress({ className = "", children, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root data-slot="progress" className={`fb-progress ${className}`} {...props}>
      {children}
      <ProgressPrimitive.Track data-slot="progress-track" className="fb-progress-track">
        <ProgressPrimitive.Indicator data-slot="progress-indicator"
          className="fb-progress-indicator" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

type ProgressLabelProps = Omit<ComponentProps<typeof ProgressPrimitive.Label>, "className"> & {
  className?: string;
};

export function ProgressLabel({ className = "", ...props }: ProgressLabelProps) {
  return <ProgressPrimitive.Label data-slot="progress-label"
    className={`fb-progress-label ${className}`} {...props} />;
}
