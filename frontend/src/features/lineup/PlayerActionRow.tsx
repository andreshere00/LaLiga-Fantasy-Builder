import { useId } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { materialIconPaths } from "../../assets/material-icons/paths";

export type PlayerActionIcon = keyof typeof materialIconPaths;
/** Colour family per option group, so market, details and lineup actions read apart. */
export type PlayerActionTone = "market" | "details" | "lineup" | "danger";

type Common = {
  icon: PlayerActionIcon;
  tone: PlayerActionTone;
  label: string;
  /** One line on what happens next, or why the action is off. */
  hint?: string | null;
};

type Props = Common & (
  | { onClick: () => void; disabled?: boolean; to?: never; state?: never }
  | { to: LinkProps["to"]; state?: LinkProps["state"]; onClick?: () => void; disabled?: never }
);

/** One option in a player dialog: icon tile, label, explanation and a chevron. */
export function PlayerActionRow({ icon, tone, label, hint, ...action }: Props) {
  const labelId = useId();
  const hintId = useId();
  const body = (
    <>
      <span className="player-action-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false"><path d={materialIconPaths[icon]} /></svg>
      </span>
      <span className="player-action-text">
        <span id={labelId} className="player-action-label">{label}</span>
        {hint ? <span id={hintId} className="player-action-hint">{hint}</span> : null}
      </span>
      <svg className="player-action-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={materialIconPaths.chevron_right} />
      </svg>
    </>
  );
  const a11y = { "aria-labelledby": labelId, "aria-describedby": hint ? hintId : undefined };
  const className = `player-action player-action--${tone}`;
  if (action.to != null) {
    return (
      <Link className={className} to={action.to} state={action.state} onClick={action.onClick} {...a11y}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={className} disabled={action.disabled} onClick={action.onClick} {...a11y}>
      {body}
    </button>
  );
}
