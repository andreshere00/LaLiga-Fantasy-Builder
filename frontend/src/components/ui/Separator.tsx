// Adapted from shadcn/ui's Base UI Separator (MIT). See shadcn-LICENSE.md.
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import type { ComponentProps } from "react";
import "./Separator.css";

type SeparatorProps = Omit<ComponentProps<typeof SeparatorPrimitive>, "className"> & {
  className?: string;
  decorative?: boolean;
};

export function Separator({
  className = "", orientation = "horizontal", decorative = true, ...props
}: SeparatorProps) {
  return <SeparatorPrimitive {...props} data-slot="separator" orientation={orientation}
    aria-hidden={decorative || undefined} role={decorative ? "presentation" : "separator"}
    className={`fb-separator ${className}`} />;
}
