import { t, useTranslation } from "../../i18n";

import "./PlayerBookmarkButton.css";

type PlayerBookmarkButtonProps = {
  pressed: boolean;
  disabled?: boolean;
  playerName: string;
  onToggle: () => void;
  showLabel?: boolean;
};

export function PlayerBookmarkButton({
  pressed,
  disabled = false,
  playerName,
  onToggle,
  showLabel = false,
}: PlayerBookmarkButtonProps) {
  useTranslation();
  return (
    <button
      type="button"
      disabled={disabled}
      className={["player-bookmark-btn", pressed && "is-active"].filter(Boolean).join(" ")}
      aria-label={t("Favorite {{0}}", { 0: playerName })}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      <svg className="player-bookmark-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12v18l-6-4-6 4V3Z" stroke="currentColor" strokeWidth="1.5" fill={pressed ? "currentColor" : "none"} />
      </svg>
      {showLabel ? <span>{t("Favorite")}</span> : null}
    </button>
  );
}
