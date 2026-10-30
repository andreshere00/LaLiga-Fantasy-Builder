// Adapted from shadcn/ui's Base UI Checkbox (MIT). See shadcn-LICENSE.md.
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import type { ComponentProps } from "react";
import "./Checkbox.css";

type CheckboxProps = Omit<ComponentProps<typeof CheckboxPrimitive.Root>, "className"> & {
  className?: string;
};

export function Checkbox({ className = "", ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root data-slot="checkbox" className={`fb-checkbox ${className}`} {...props}>
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator"
        className="fb-checkbox-indicator">✓</CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
