import bookmarkIcon from "../../assets/button_bookmark_red.svg";

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
      <img src={bookmarkIcon} alt="" aria-hidden />
    </button>
  );
}
