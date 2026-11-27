import type { ReactNode } from "react";

import { t, useTranslation } from "../../../i18n";

export type MarketDialogFact = { label: string; value: ReactNode; tone?: "failure" };

/** Shows the budget and timing facts a money decision depends on, next to its confirm button. */
export function MarketDialogFacts({ facts }: { facts: MarketDialogFact[] }) {
  useTranslation();
  return (
    <dl className="fb-metric-grid market-dialog-facts">
      {facts.map((fact) => (
        <div key={fact.label} data-tone={fact.tone}>
          <dt>{t(fact.label)}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
