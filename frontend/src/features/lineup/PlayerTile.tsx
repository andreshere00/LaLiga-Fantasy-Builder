import "../../components/TooltipPanel.css";
import "./PlayerTile.css";

import { scoreTone } from "../../api/mappers";
import { WarningIcon } from "../shell/icons";
import { NOT_SELECTED_PLAYER_LABEL } from "./playerTileCopy";

type PlayerTileProps = {
  name: string;
  captain: boolean;
  variant: "pitch" | "squad";
  /** When false, the name bar is omitted and the photo is centered on the whole card. */
  showName?: boolean;
  empty?: boolean;
  photoUrl?: string | null;
  teamBadgeUrl?: string | null;
  fixturePoints?: number | null;
  fixtureScoreTooltip?: string | null;
  isMvp?: boolean;
  selected?: boolean;
  interactive?: boolean;
  onSelect?: () => void;
};

export function PlayerScoreBadge({
  points,
  isMvp = false,
}: {
  points: number;
  isMvp?: boolean;
}) {
  const tone = scoreTone(points, isMvp);
  return (
    <span className={`player-score-badge is-${tone}`} aria-hidden="true">
      <span className="player-score-badge-value">{points}</span>
    </span>
  );
}

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
  showName = true,
  empty = false,
  photoUrl = null,
  teamBadgeUrl = null,
  fixturePoints = null,
  fixtureScoreTooltip = null,
  isMvp = false,
  selected = false,
  interactive = false,
  onSelect,
}: PlayerTileProps) {
  const className = [
    "player-tile",
    variant === "squad" ? "squad-tile" : "pitch-tile",
    showName ? "" : "is-nameless",
    empty ? "is-empty" : "",
    captain ? "is-captain" : "",
    selected ? "is-selected" : "",
    interactive ? "is-interactive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const scoreLabel =
    fixturePoints == null
      ? ""
      : isMvp
        ? `, ${fixturePoints} points, MVP`
        : `, ${fixturePoints} points`;
  const label = empty
    ? NOT_SELECTED_PLAYER_LABEL
    : captain
      ? `${name}, captain${scoreLabel}`
      : `${name}${scoreLabel}`;

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
    </>
  ) : (
    <>
      <div className="player-card-spacer" aria-hidden="true" />
      <PlayerPhoto url={photoUrl} />
      {fixturePoints != null ? (
        fixtureScoreTooltip ? (
          <span className="player-score-badge-wrap has-hover-tooltip-panel">
            <PlayerScoreBadge points={fixturePoints} isMvp={isMvp} />
            <span className="hover-tooltip-panel is-align-start" role="tooltip">
              {fixtureScoreTooltip}
            </span>
          </span>
        ) : (
          <PlayerScoreBadge points={fixturePoints} isMvp={isMvp} />
        )
      ) : null}
      <TeamBadge url={teamBadgeUrl} />
      {showName ? (
        <>
          <div className="player-card-gap" aria-hidden="true" />
          <span className="player-name">
            <span className="player-name-label">{name}</span>
          </span>
        </>
      ) : null}
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
    <div
      className={className}
      aria-label={empty || !showName ? label : captain ? `${name}, captain` : undefined}
    >
      {body}
    </div>
  );
}
