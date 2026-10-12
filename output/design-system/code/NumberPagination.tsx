type NumberPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function NumberPagination({ page, totalPages, onPageChange }: NumberPaginationProps) {
  if (!Number.isInteger(totalPages) || totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);
  const count = Math.min(3, totalPages);
  const start = Math.max(1, Math.min(current - 1, totalPages - count + 1));
  const pages = Array.from({ length: count }, (_, index) => start + index);
  return (
    <nav aria-label="Player result pages" className="fb-pagination">
      {pages.map((number) => (
        <button key={number} type="button" className="fb-page-button"
          aria-current={number === current ? "page" : undefined}
          aria-label={`Page ${number}`}
          onClick={() => onPageChange(number)}>{number}</button>
      ))}
      <span className="fb-helper" aria-live="polite">Page {current} of {totalPages}</span>
    </nav>
  );
}
