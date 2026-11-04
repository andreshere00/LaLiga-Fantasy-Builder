import type { ReactNode } from "react";
import { Help } from "../../components/ui/Help";

export function CurrentFixtureTooltip({ message, children }: { message: string | null; children: ReactNode }) {
  if (!message) return children;
  return <Help className="current-fixture-tooltip" content={message}>{children}</Help>;
}
