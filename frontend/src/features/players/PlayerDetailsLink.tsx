import { Link, useMatch } from "react-router-dom";

import infoIcon from "../../assets/button_info.svg";
import infoRedIcon from "../../assets/button_info_red.svg";
import infoRedWhiteIcon from "../../assets/button_info_red_white.svg";

type PlayerDetailsLinkProps = {
  playerId: string;
  playerName: string;
  className?: string;
  /** Gray player card by default, red when the market or players row is hovered. */
  card?: boolean;
};

/** Navigates to the player detail screen with an info icon. */
export function PlayerDetailsLink({
  playerId,
  playerName,
  className,
  card = false,
}: PlayerDetailsLinkProps) {
  const match = useMatch(`/players/${playerId}`);
  const active = match != null;
  return (
    <Link
      to={`/players/${encodeURIComponent(playerId)}`}
      className={["player-details-link", className].filter(Boolean).join(" ")}
      aria-label={`${playerName}, view details`}
    >
      {card ? (
        <>
          <img
            className="player-details-icon is-for-gray"
            src={infoRedWhiteIcon}
            alt=""
            aria-hidden
          />
          <img className="player-details-icon is-for-red" src={infoIcon} alt="" aria-hidden />
        </>
      ) : (
        <img src={active ? infoRedIcon : infoIcon} alt="" aria-hidden />
      )}
    </Link>
  );
}
