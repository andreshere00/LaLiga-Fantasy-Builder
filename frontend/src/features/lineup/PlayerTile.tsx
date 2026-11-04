import { copy as localizeCopy, useLanguage, i18n } from "../../i18n";
import { BadgeImage } from "../../components/BadgeImage";
import { clubMediaFromBadge } from "../../api/clubMedia";
import { useState } from "react";
import { Help } from "../../components/ui/Help";
import "./PlayerTile.css";

import { scoreTone, scoreWeekLabel } from "../../api/mappers";
import { PersonIcon, WarningIcon } from "../shell/icons";
import { fixtureHighlightLabel, type FixtureHighlight } from "./fixtureHighlight";
import {
  fixtureScoreLineLabel,
  signedFixturePoints,
  type FixtureScoreLine,
} from "./fixtureScoreLines";
import { LINEUP_POSITION_NEEDED_LABEL, NOT_SELECTED_PLAYER_LABEL } from "./playerTileCopy";
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
  /** Goal or clean sheet for the fixture shown on the lineup pitch. */
  fixtureHighlight?: FixtureHighlight | null;
  /** Matchweek events that make up the fixture score. */
  fixtureScoreLines?: readonly FixtureScoreLine[] | null;
  squadStats?: SquadPlayerStats;
  unplayedFixture?: boolean;
  /** Squad or empty pitch card for a position the lineup still needs. */
  positionNeeded?: boolean;
  isMvp?: boolean;
  selected?: boolean;
  interactive?: boolean;
  onSelect?: () => void;
};

function FixtureScoreBreakdown({ lines }: { lines: readonly FixtureScoreLine[] }) {
  useLanguage();
  return (
    <table className="player-score-breakdown">
      <caption>{localizeCopy("Fixture points")}</caption>
      <thead>
        <tr>
          <th scope="col">{localizeCopy("Event")}</th>
          <th scope="col">{localizeCopy("Count")}</th>
          <th scope="col">{localizeCopy("Points")}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.key}>
            <th scope="row">{localizeCopy(line.label)}</th>
            <td className="player-score-count">{localizeCopy(line.count ?? "—")}</td>
            <td className="player-score-points">
              <span className="player-score-figure">{localizeCopy(signedFixturePoints(line.points))}</span>
              <span className="player-score-unit">{localizeCopy("p")}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PlayerScoreBadge({
  points,
  isMvp = false,
}: {
  points: number;
  isMvp?: boolean;
}) {
  useLanguage();
  const tone = scoreTone(points, isMvp);
  return (
    <span className={`player-score-badge is-${tone}`} aria-hidden="true">
      <span className="player-score-badge-value">{points}</span>
    </span>
  );
}

function TeamBadge({ url }: { url: string | null | undefined }) {
  useLanguage();
  const media = clubMediaFromBadge(url);
  if (!media) return null;
  return <span className="player-badge" aria-hidden="true">
    <BadgeImage className="player-team-badge" media={media} fallback="" />
  </span>;
}

function PlayerPhoto({ candidates }: { candidates: readonly string[] }) {
  useLanguage();
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
  fixtureHighlight = null,
  fixtureScoreLines = null,
  squadStats,
  unplayedFixture = false,
  positionNeeded = false,
  isMvp = false,
  selected = false,
  interactive = false,
  onSelect,
}: PlayerTileProps) {
  useLanguage();
  const shownHighlight = empty ? null : fixtureHighlight;
  const highlightText = fixtureHighlightLabel(shownHighlight);
  const scoreLineTexts = (empty ? [] : fixtureScoreLines ?? []).map(fixtureScoreLineLabel);
  const positionNeededText = positionNeeded && !shownHighlight
    ? LINEUP_POSITION_NEEDED_LABEL : null;
  const className = [
    "player-tile",
    variant === "squad" ? "squad-tile" : "pitch-tile",
    showName ? "" : "is-nameless",
    empty ? "is-empty" : "",
    captain ? "is-captain" : "",
    selected ? "is-selected" : "",
    interactive ? "is-interactive" : "",
    unplayedFixture ? "is-unplayed-fixture" : "",
    shownHighlight ? "is-fixture-highlight" : "",
    positionNeededText ? "is-position-needed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const scoreLabel =
    fixturePoints == null
      ? ""
      : isMvp
        ? `, ${fixturePoints} ${localizeCopy("points")}, MVP`
        : `, ${fixturePoints} ${localizeCopy("points")}`;
  const form = squadStats?.outlook;
  const formRating = playerFormPresentation(form?.rating);
  const formLabel = form ? `Current form: ${localizeCopy(formRating?.label ?? "Unavailable")}` : null;
  const totalLabel = squadStats
    ? `Season total: ${squadStats.totalPoints ?? localizeCopy("Unavailable")} Fantasy points` : null;
  const starterLabel = form ? i18n.t("Starter probability: {{0}}{{1}}", {
    0: form.starterProbability == null ? localizeCopy("Unavailable") : `${form.starterProbability}%`,
    1: form.matchweek == null ? "" : i18n.t(" for matchday {{0}}", { 0: form.matchweek }),
  }) : null;
  const playerLabel = empty
    ? NOT_SELECTED_PLAYER_LABEL
    : captain
      ? `${name}, ${localizeCopy("Captain")}${scoreLabel}`
      : `${name}${scoreLabel}`;
  const label = [
    playerLabel, highlightText, positionNeededText, ...scoreLineTexts,
    totalLabel, starterLabel, formLabel,
  ]
    .filter(Boolean)
    .map(fragment => localizeCopy(fragment))
    .join(", ");
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
        <span className="player-name-label">{localizeCopy(NOT_SELECTED_PLAYER_LABEL)}</span>
      </span>
    </>
  ) : (
    <>
      <div className="player-card-spacer" aria-hidden="true" />
      <PlayerPhoto key={`${name}|${photoCandidates.join("|")}`} candidates={photoCandidates} />
      {squadStats ? <span className="player-total-points" aria-hidden="true">
        {localizeCopy(squadStats.totalPoints ?? "—")}<span>{localizeCopy("p")}</span>
      </span> : fixturePoints != null ? (
        <PlayerScoreBadge points={fixturePoints} isMvp={isMvp} />
      ) : null}
      <TeamBadge key={teamBadgeUrl ?? "no-badge"} url={teamBadgeUrl} />
      {form ? <span className="player-starter-probability"
        data-tone={starterProbabilityTone(form.starterProbability) ?? undefined} aria-hidden="true">
        {localizeCopy(form.starterProbability == null ? "—" : `${form.starterProbability}%`)}
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
  const helpLines = [
    highlightText, positionNeededText, fixtureHelp, totalLabel, starterLabel,
  ].filter((line): line is string => Boolean(line));
  const help = helpLines.length === 0 && scoreLineTexts.length === 0 && !formLabel ? null : (
    <>
      {helpLines.map((line) => (
        <span key={line}>
          {localizeCopy(line)}
          <br />
        </span>
      ))}
      {scoreLineTexts.length > 0 ? (
        <FixtureScoreBreakdown lines={empty ? [] : fixtureScoreLines ?? []} />
      ) : null}
      {formLabel ? (
        <>
          {localizeCopy(formLabel)}.
          <br />
          {localizeCopy("Current")}{" "}
          <a href="https://www.futbolfantasy.com/" target="_blank" rel="noreferrer">
            {localizeCopy("FutbolFantasy")}</a>{" "}
          {localizeCopy("rating.")}</>
      ) : null}
    </>
  );
  const statusText = [highlightText, positionNeededText].filter(Boolean).map(fragment => localizeCopy(fragment)).join(", ");
  const visibleLabel = statusText
    ? [captain ? `${name}, ${localizeCopy("Captain")}` : name, statusText].join(", ")
    : captain ? `${name}, ${localizeCopy("Captain")}` : undefined;
  if (interactive && onSelect) {
    return <Help content={help} trigger={<button type="button" className={className}
      aria-label={localizeCopy(label)} aria-pressed={selected} onClick={onSelect} />}>{body}</Help>;
  }
  return <Help content={help} trigger={<div className={className}
    aria-label={empty || !showName ? label : visibleLabel} />}>
    {body}
  </Help>;
}
