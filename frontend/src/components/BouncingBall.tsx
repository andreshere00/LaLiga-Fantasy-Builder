import "./BouncingBall.css";

export type BouncingBallSize = "sm" | "md" | "lg" | "xl";

/** A small ball bouncing over a shadow, used as a decorative loading indicator. */
export function BouncingBall({ size = "md" }: { size?: BouncingBallSize }) {
  return (
    <span className={`bouncing-ball bouncing-ball--${size}`} aria-hidden="true">
      <span className="bouncing-ball__ball" />
      <span className="bouncing-ball__shadow" />
    </span>
  );
}
