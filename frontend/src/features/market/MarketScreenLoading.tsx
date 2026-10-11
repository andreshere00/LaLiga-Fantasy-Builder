import "./MarketScreenLoading.css";

const ROWS = Array.from({ length: 6 }, (_, index) => index);
const COLUMNS = Array.from({ length: 10 }, (_, index) => index);

export function MarketScreenLoading() {
  return (
    <section className="market-loading" role="status" aria-label="Loading market" aria-busy="true">
      <span className="visually-hidden">Loading market…</span>
      <div className="market-loading-toolbar" aria-hidden="true">
        <span className="market-loading-block market-loading-title" />
        <span className="market-loading-block market-loading-search" />
      </div>
      <div className="market-loading-table" aria-hidden="true">
        <div className="market-loading-row is-heading">
          {COLUMNS.map((column) => <span className="market-loading-block" key={column} />)}
        </div>
        {ROWS.map((row) => (
          <div className="market-loading-row" key={row}>
            {COLUMNS.map((column) => (
              <span
                className={`market-loading-block${column === 0 ? " is-player" : ""}`}
                key={column}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
