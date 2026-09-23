type PlayerTileProps = {
  name: string;
  captain: boolean;
  variant: "pitch" | "squad";
};

export function PlayerTile({ name, captain, variant }: PlayerTileProps) {
  const className = [
    "player-tile",
    variant === "squad" ? "squad-tile" : "pitch-tile",
    captain ? "is-captain" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className} aria-label={captain ? `${name}, captain` : undefined}>
      <span className="player-badge" aria-hidden="true" />
      <span className="player-name">{name}</span>
    </div>
  );
}
