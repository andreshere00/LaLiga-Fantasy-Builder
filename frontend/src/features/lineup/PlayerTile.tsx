import { BadgeImage } from "../../components/BadgeImage";
import { clubMediaFromBadge } from "../../api/clubMedia";
import { useState } from "react";
import { Help } from "../../components/ui/Help";
import "./PlayerTile.css";

import { scoreTone, scoreWeekLabel } from "../../api/mappers";
import { PersonIcon, WarningIcon } from "../shell/icons";
import { NOT_SELECTED_PLAYER_LABEL } from "./playerTileCopy";
import { playerFormPresentation } from "../players/playerForm";
import { starterProbabilityTone } from "../players/starterProbability";
import type { SquadPlayerStats } from "./useSquadStats";

type PlayerTileProps = {
  name: string;
  captain: boolean;
  variant: "pitch" | "squad";
  /** When false, the name bar is omitted and the photo is centered on the whole card. */
  showName?: boolean;
  empty?: boolean;
  photoUrl?: string | null;
  photoFallbackUrls?: readonly (string | null | undefined)[];
  teamBadgeUrl?: string | null;
  fixturePoints?: number | null;
  fixtureWeek?: number;
  squadStats?: SquadPlayerStats;
  unplayedFixture?: boolean;
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
  const media = clubMediaFromBadge(url);
  if (!media) return null;
  return <span className="player-badge" aria-hidden="true">
    <BadgeImage className="player-team-badge" media={media} fallback="" />
  </span>;
}

function PlayerPhoto({ candidates }: { candidates: readonly string[] }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const url = candidates[candidateIndex];
  return (
    <div className="player-photo-frame" aria-hidden="true">
      {url ? (
        <img
          className="player-photo"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() =>
            setCandidateIndex((index) =>
              index < candidates.length - 1 ? index + 1 : candidates.length,
            )
          }
        />
      ) : (
        <span className="player-empty-icon">
          <PersonIcon />
        </span>
      )}
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
  photoFallbackUrls = [],
  teamBadgeUrl = null,
  fixturePoints = null,
  fixtureWeek,
  squadStats,
  unplayedFixture = false,
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
    unplayedFixture ? "is-unplayed-fixture" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const scoreLabel =
    fixturePoints == null
      ? ""
      : isMvp
        ? `, ${fixturePoints} points, MVP`
        : `, ${fixturePoints} points`;
  const form = squadStats?.outlook;
  const formRating = playerFormPresentation(form?.rating);
  const formLabel = form ? `Current form: ${formRating?.label ?? "Unavailable"}` : null;
  const totalLabel = squadStats
    ? `Season total: ${squadStats.totalPoints ?? "Unavailable"} Fantasy points` : null;
  const starterLabel = form ? `Starter probability: ${form.starterProbability == null
    ? "Unavailable" : `${form.starterProbability}%`}${form.matchweek == null
      ? "" : ` for ${scoreWeekLabel(form.matchweek)}`}` : null;
  const playerLabel = empty
    ? NOT_SELECTED_PLAYER_LABEL
    : captain
      ? `${name}, captain${scoreLabel}`
      : `${name}${scoreLabel}`;
  const label = [playerLabel, totalLabel, starterLabel, formLabel].filter(Boolean).join(", ");
  const photoCandidates = [
    ...new Set(
      [photoUrl, ...photoFallbackUrls].filter(
        (url): url is string => typeof url === "string" && url.length > 0,
      ),
    ),
  ];

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
      <PlayerPhoto key={`${name}|${photoCandidates.join("|")}`} candidates={photoCandidates} />
      {squadStats ? <span className="player-total-points" aria-hidden="true">
        {squadStats.totalPoints ?? "—"}<span>p</span>
      </span> : fixturePoints != null ? (
        <PlayerScoreBadge points={fixturePoints} isMvp={isMvp} />
      ) : null}
      <TeamBadge key={teamBadgeUrl ?? "no-badge"} url={teamBadgeUrl} />
      {form ? <span className="player-starter-probability"
        data-tone={starterProbabilityTone(form.starterProbability) ?? undefined} aria-hidden="true">
        {form.starterProbability == null ? "—" : `${form.starterProbability}%`}
      </span> : null}
      {form ? <span className="player-form-badge" aria-hidden="true">
        {formRating ? <>
          <img className="is-light" src={formRating.icons.light} alt="" />
          <img className="is-dark" src={formRating.icons.dark} alt="" />
        </> : <span>—</span>}
      </span> : null}
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

  const fixtureHelp = unplayedFixture
    ? `Fixture ${fixtureWeek == null ? "" : scoreWeekLabel(fixtureWeek)}`
      + " has not been played yet."
    : null;
  const help = [fixtureHelp, totalLabel, starterLabel,
    formLabel ? `${formLabel}. Current FutbolFantasy rating.` : null]
    .filter(Boolean).join("\n");
  if (interactive && onSelect) {
    return <Help content={help} trigger={<button type="button" className={className}
      aria-label={label} aria-pressed={selected} onClick={onSelect} />}>{body}</Help>;
  }
  return <Help content={help} trigger={<div className={className}
    aria-label={empty || !showName ? label : captain ? name + ", captain" : undefined} />}>
    {body}
  </Help>;
}
