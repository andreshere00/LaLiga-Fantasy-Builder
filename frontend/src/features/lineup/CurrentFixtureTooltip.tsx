import { copy as localizeCopy, useLanguage } from "../../i18n";
import type { ReactNode } from "react";
import { Help } from "../../components/ui/Help";

export function CurrentFixtureTooltip({ message, children }: { message: string | null; children: ReactNode }) {
  useLanguage();
  if (!message) return children;
  return <Help className="current-fixture-tooltip" content={localizeCopy(message)}>{localizeCopy(children)}</Help>;
}
