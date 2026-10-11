import "./PlayerScreenLoading.css";

function LoadingBlock({ className = "" }: { className?: string }) {
  return <span className={["player-loading-block", className].filter(Boolean).join(" ")} />;
}

export function PlayersScreenLoading() {
  return (
    <div
      className="players-loading-state"
      role="status"
      aria-label="Loading players"
      aria-busy="true"
    >
      <span className="visually-hidden">Loading players…</span>
      <div className="players-loading-toolbar">
        <LoadingBlock className="players-loading-title" />
        <LoadingBlock className="players-loading-search" />
      </div>
      <div className="players-loading-table" aria-hidden="true">
        <div className="players-loading-head">
          {Array.from({ length: 10 }, (_, index) => (
            <LoadingBlock key={index} />
          ))}
        </div>
        {Array.from({ length: 7 }, (_, row) => (
          <div className="players-loading-row" key={row}>
            <LoadingBlock className="players-loading-avatar" />
            {Array.from({ length: 9 }, (_, cell) => (
              <LoadingBlock key={cell} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingPanel({ rows = 3 }: { rows?: number }) {
  return (
    <section className="player-detail-panel player-detail-loading-panel" aria-hidden="true">
      <LoadingBlock className="player-detail-loading-heading" />
      <div className="player-detail-loading-grid">
        {Array.from({ length: rows }, (_, index) => (
          <div className="player-detail-loading-card" key={index}>
            <LoadingBlock />
            <LoadingBlock />
            <LoadingBlock />
          </div>
        ))}
      </div>
    </section>
  );
}

export function PlayerDetailScreenLoading() {
  return (
    <section className="player-detail-page player-detail-loading-state" aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading player details…
      </span>
      <div
        className="player-detail-panel player-detail-header player-detail-loading-header"
        aria-hidden="true"
      >
        <LoadingBlock className="player-detail-loading-photo" />
        <div className="player-detail-loading-player-copy">
          <LoadingBlock className="player-detail-loading-name" />
          <LoadingBlock />
        </div>
        <LoadingBlock className="player-detail-loading-action" />
      </div>
      <LoadingPanel rows={5} />
      <LoadingPanel rows={4} />
      <LoadingPanel rows={3} />
      <LoadingPanel rows={3} />
    </section>
  );
}
