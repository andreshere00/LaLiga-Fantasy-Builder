// Adapted from shadcn/ui's Skeleton (MIT). See shadcn-LICENSE.md.
import type { ComponentProps } from "react";
import "./Skeleton.css";

/** A pulsing placeholder for content that is still loading; decorative, so hidden from assistive tech. */
export function Skeleton({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={`fb-skeleton ${className}`} {...props} />;
}
