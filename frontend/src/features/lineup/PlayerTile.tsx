import { WarningIcon } from "../shell/icons";
import { NOT_SELECTED_PLAYER_LABEL } from "./playerTileCopy";

type PlayerTileProps = {
  name: string;
  captain: boolean;
  variant: "pitch" | "squad";
  empty?: boolean;
  photoUrl?: string | null;
  teamBadgeUrl?: string | null;
  selected?: boolean;
  interactive?: boolean;
  onSelect?: () => void;
};

function TeamBadge({ url }: { url: string | null | undefined }) {
  if (!url) return null;
  return (
    <span className="player-badge" aria-hidden="true">
      <img className="player-team-badge" src={url} alt="" loading="lazy" decoding="async" />
    </span>
  );
}

function PlayerPhoto({ url }: { url: string | null | undefined }) {
  return (
    <div className="player-photo-frame" aria-hidden="true">
      {url ? (
        <img
          className="player-photo"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : null}
    </div>
  );
}

export function PlayerTile({
  name,
  captain,
  variant,
  empty = false,
  photoUrl = null,
  teamBadgeUrl = null,
  selected = false,
  interactive = false,
  onSelect,
}: PlayerTileProps) {
  const className = [
    "player-tile",
    variant === "squad" ? "squad-tile" : "pitch-tile",
    empty ? "is-empty" : "",
    captain ? "is-captain" : "",
    selected ? "is-selected" : "",
    interactive ? "is-interactive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = empty
    ? NOT_SELECTED_PLAYER_LABEL
    : captain
      ? `${name}, captain`
      : name;

  const body = empty ? (
    <>
      <div className="player-card-spacer" aria-hidden="true" />
      <div className="player-photo-frame player-photo-frame-empty">
        <span className="player-empty-icon">
          <WarningIcon />
        </span>
      </div>
      <div className="player-card-gap" aria-hidden="true" />
      <span className="player-name player-name-empty">
        <span className="player-name-label">{NOT_SELECTED_PLAYER_LABEL}</span>
      </span>
      <div className="player-card-spacer player-card-spacer-bottom" aria-hidden="true" />
    </>
  ) : (
    <>
      <div className="player-card-spacer" aria-hidden="true" />
      <PlayerPhoto url={photoUrl} />
      <TeamBadge url={teamBadgeUrl} />
      <div className="player-card-gap" aria-hidden="true" />
      <span className="player-name">
        <span className="player-name-label">{name}</span>
      </span>
      <div className="player-card-spacer player-card-spacer-bottom" aria-hidden="true" />
    </>
  );

  if (interactive && onSelect) {
    return (
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={className} aria-label={empty ? label : captain ? `${name}, captain` : undefined}>
      {body}
    </div>
  );
}
