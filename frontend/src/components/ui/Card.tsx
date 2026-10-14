// Adapted from shadcn/ui (MIT). See shadcn-LICENSE.md.
import type { ComponentProps } from "react";
import "./StandingsPrimitives.css";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={`fb-card ${className}`} {...props} />;
}

export function CardHeader({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={`fb-card-header ${className}`} {...props} />;
}

export function CardTitle({ className = "", ...props }: ComponentProps<"h2">) {
  return <h2 data-slot="card-title" className={`fb-card-title ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={`fb-card-content ${className}`} {...props} />;
}
