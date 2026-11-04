import { copy as localizeCopy, useLanguage } from "../../i18n";
import type { ComponentProps } from "react";

export function RichRow({ className, children, ...props }: ComponentProps<"li">) {
  useLanguage();
  return <li {...props} className={["market-row", "market-data-row", className].filter(Boolean).join(" ")}>{localizeCopy(children)}</li>;
}
