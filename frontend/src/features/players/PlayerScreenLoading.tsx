import { copy as localizeCopy, useLanguage } from "../../i18n";
import { PulseRing } from "../../components/ui/PulseRing";
import "./PlayerScreenLoading.css";

function LoadingBlock({ className = "" }: { className?: string }) {
  useLanguage();
  return <span className={["player-loading-block", className].filter(Boolean).join(" ")} />;
}

export function PlayersScreenLoading() {
  useLanguage();
  return (
    <div
      className="players-loading-state"
      role="status"
      aria-label={localizeCopy("Loading players")}
      aria-busy="true"
    >
      <span className="visually-hidden">{localizeCopy("Loading players…")}</span>
      <div className="players-loading-toolbar">
        <LoadingBlock className="players-loading-title" />
        <LoadingBlock className="players-loading-search" />
      </div>
      <div className="players-loading-table" aria-hidden="true">
        <div className="players-loading-head">
          {Array.from({ length: 9 }, (_, index) => (
            <LoadingBlock key={index} />
          ))}
        </div>
        {Array.from({ length: 7 }, (_, row) => (
          <div className="players-loading-row" key={row}>
            <LoadingBlock className="players-loading-avatar" />
            {Array.from({ length: 8 }, (_, cell) => (
              <LoadingBlock key={cell} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerDetailScreenLoading() {
  useLanguage();
  return <section className="player-detail-page" aria-busy="true"><PulseRing label={localizeCopy("Loading player details…")} /></section>;
}
