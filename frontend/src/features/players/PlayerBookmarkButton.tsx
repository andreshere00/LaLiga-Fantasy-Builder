import type { CSSProperties } from "react";
import bookmarkIcon from "../../assets/button_bookmark_red.svg";
import "./PlayerBookmarkButton.css";

type PlayerBookmarkButtonProps = {
  pressed: boolean;
  playerName: string;
  onToggle: () => void;
};

export function PlayerBookmarkButton({
  pressed,
  playerName,
  onToggle,
}: PlayerBookmarkButtonProps) {
  return (
    <button
      type="button"
      className={["player-bookmark-btn", pressed && "is-active"].filter(Boolean).join(" ")}
      aria-label={pressed ? `Remove ${playerName} from favorites` : `Favorite ${playerName}`}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      <span
        className="player-bookmark-icon"
        style={{ "--bookmark-icon": `url("${bookmarkIcon}")` } as CSSProperties}
        aria-hidden="true"
      />
    </button>
  );
}
