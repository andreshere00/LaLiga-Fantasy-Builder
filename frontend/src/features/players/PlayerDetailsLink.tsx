import { Link, useMatch } from "react-router-dom";

import infoIcon from "../../assets/button_info.svg";
import infoRedIcon from "../../assets/button_info_red.svg";

type PlayerDetailsLinkProps = {
  playerId: string;
  playerName: string;
  className?: string;
};

/** Navigates to the player detail screen with an info icon. */
export function PlayerDetailsLink({ playerId, playerName, className }: PlayerDetailsLinkProps) {
  const match = useMatch(`/players/${playerId}`);
  const active = match != null;
  return (
    <Link
      to={`/players/${encodeURIComponent(playerId)}`}
      className={["player-details-link", className].filter(Boolean).join(" ")}
      aria-label={`${playerName}, view details`}
    >
      <img src={active ? infoRedIcon : infoIcon} alt="" aria-hidden />
    </Link>
  );
}
