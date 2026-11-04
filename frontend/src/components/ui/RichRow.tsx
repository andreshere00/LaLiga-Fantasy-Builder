import type { ComponentProps } from "react";

export function RichRow({ className, children, ...props }: ComponentProps<"li">) {
  return <li {...props} className={["market-row", "market-data-row", className].filter(Boolean).join(" ")}>{children}</li>;
}
