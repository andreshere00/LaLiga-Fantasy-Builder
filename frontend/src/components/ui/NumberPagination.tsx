import { useRef, type ReactNode } from "react";

type NumberPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label?: string;
  caption?: ReactNode;
};

/** Sliding numeric window; every page remains reachable without arrow controls. */
export function NumberPagination({
  page, totalPages, onPageChange, label = "Player result pages", caption,
}: NumberPaginationProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  if (!Number.isInteger(totalPages) || totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);
  const count = Math.min(3, totalPages);
  const start = Math.max(1, Math.min(current - 1, totalPages - count + 1));
  const pages = Array.from({ length: count }, (_, index) => start + index);
  return (
    <nav aria-label={label} className="fb-pagination">
      {pages.map((number, index) => (
        <button key={index} ref={(node) => { buttons.current[index] = node; }}
          type="button" className="fb-page-button"
          aria-current={number === current ? "page" : undefined}
          aria-label={"Page " + number}
          onClick={() => {
            onPageChange(number);
            // Stable window slots keep keyboard focus when numbers slide.
            buttons.current[index]?.focus();
          }}>{number}</button>
      ))}
      <span className="fb-helper" aria-live="polite">
        {caption ?? ("Page " + current + " of " + totalPages)}
      </span>
    </nav>
  );
}
