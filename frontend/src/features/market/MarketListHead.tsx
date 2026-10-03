import type { MarketColumnHeading, MarketColumnKey } from "./marketColumnHeadings";

type MarketListHeadProps = {
  headings: Record<MarketColumnKey, MarketColumnHeading>;
};

function HeadCell({
  heading,
  className,
}: {
  heading: MarketColumnHeading;
  className?: string;
}) {
  return (
    <span className={heading.filtered ? `is-column-filtered ${className ?? ""}`.trim() : className}>
      {heading.label}
    </span>
  );
}

export function MarketListHead({ headings }: MarketListHeadProps) {
  return (
    <li className="market-row market-head" aria-hidden="true">
      <HeadCell heading={headings.player} className="market-head-player" />
      <HeadCell heading={headings.position} />
      <HeadCell heading={headings.fsyp} />
      <HeadCell heading={headings.form} />
      <HeadCell heading={headings.marketValue} />
      <HeadCell heading={headings.availability} />
      <HeadCell heading={headings.sealEnd} />
      <HeadCell heading={headings.sellOptions} />
    </li>
  );
}
