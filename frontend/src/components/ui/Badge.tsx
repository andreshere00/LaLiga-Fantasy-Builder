// Adapted from shadcn/ui's Base UI Badge (MIT). See shadcn-LICENSE.md.
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import "./StandingsPrimitives.css";

export function Badge({
  className = "", variant = "outline", render, ...props
}: useRender.ComponentProps<"span"> & { variant?: "outline" | "success" | "warning" | "failure" }) {
  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">({ className: `fb-badge fb-badge--${variant} ${className}` }, props),
    state: { slot: "badge", variant },
  });
}
