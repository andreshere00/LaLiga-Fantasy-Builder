import { t, useTranslation } from "../../i18n";
import { useRef, type ReactNode } from "react";

type NumberPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label?: string;
  caption?: ReactNode;
  showArrows?: boolean;
};

/** Sliding numeric window with optional previous and next controls. */
export function NumberPagination({
  page, totalPages, onPageChange, label, caption, showArrows = false,
}: NumberPaginationProps) {
  useTranslation();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  if (!Number.isInteger(totalPages) || totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);
  const count = Math.min(3, totalPages);
  const start = Math.max(1, Math.min(current - 1, totalPages - count + 1));
  const pages = Array.from({ length: count }, (_, index) => start + index);
  return (
    <nav aria-label={label ?? t("Player result pages")} className="fb-pagination">
      {showArrows ? <button type="button" className="fb-page-button fb-page-arrow"
        aria-label={t("Previous page")} disabled={current === 1}
        onClick={() => onPageChange(current - 1)}>←</button> : null}
      {pages.map((number, index) => (
        <button key={index} ref={(node) => { buttons.current[index] = node; }}
          type="button" className="fb-page-button"
          aria-current={number === current ? "page" : undefined}
          aria-label={t("Page {{0}}", { 0: number })}
          onClick={() => {
            onPageChange(number);
            // Stable window slots keep keyboard focus when numbers slide.
            buttons.current[index]?.focus();
          }}>{number}</button>
      ))}
      {showArrows ? <button type="button" className="fb-page-button fb-page-arrow"
        aria-label={t("Next page")} disabled={current === totalPages}
        onClick={() => onPageChange(current + 1)}>→</button> : null}
      <span className="fb-helper" aria-live="polite">
        {(caption ?? (t("Page {{0}} of {{1}}", { 0: current, 1: totalPages })))}
      </span>
    </nav>
  );
}
