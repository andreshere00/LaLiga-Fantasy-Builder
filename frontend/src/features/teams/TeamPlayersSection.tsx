import { useState } from "react";
import { t, useTranslation } from "../../i18n";
import { positionLabel } from "../market/positions";
import { usePlayerOutlooks } from "../lineup/useSquadStats";
import { usePlayerRadar } from "../players/radar/usePlayerRadar";
import type { ClubDossierDto } from "../../api/schemas";
import { SQUAD_COLUMNS, sortSquad, type SquadColumn, type SquadRow } from "./teamTable";

type Roster = NonNullable<ClubDossierDto["roster"]>;

const COLUMN_LABELS: Record<SquadColumn, string> = {
  points: "FSYP",
  minutes: "Minutes",
  goals: "Goals",
  assists: "Assists",
  dribbles: "Dribbles",
  penaltiesCommitted: "Penalties committed",
  penaltiesSaved: "Penalties saved",
  shots: "Shots",
  recoveries: "Recoveries",
  saves: "Saves",
  ballsLost: "Balls lost",
  yellowCards: "Yellow cards",
  redCards: "Red cards",
};

const INJURY_LABELS: Record<string, string> = {
  "Pendiente pruebas": "Awaiting tests",
  Postoperatorio: "Post-operative",
  Rehabilitación: "Rehabilitation",
  "Trabajo de campo": "Field work",
  "Parcial con el grupo": "Partial training with the group",
  "Grupo sin el alta": "Training with the group",
};

export function TeamPlayersSection({
  roster,
  injuries,
}: {
  roster: Roster;
  injuries: ClubDossierDto["injuries"];
}) {
  useTranslation();
  const outlooks = usePlayerOutlooks(roster.mvps.map((player) => player.playerId));
  const [column, setColumn] = useState<SquadColumn | "position">("position");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const rows = sortSquad(roster.players.map(toRow), column, direction);
  const weeks = roster.coverage.matchweeks.join(", ");
  return (
    <section id="team-players" aria-labelledby="team-players-title">
      <h2 id="team-players-title">{t("Players")}</h2>
      <h3>{t("MVPs")}</h3>
      <ul className="team-mvp-list">
        {roster.mvps.map((player) => (
          <MvpCard
            key={player.playerId}
            player={player}
            outlook={outlooks.profiles.get(player.playerId)}
          />
        ))}
      </ul>
      <h3>{t("Injured players")}</h3>
      <TeamInjuryList injuries={injuries} />
      <h3>{t("Squad")}</h3>
      <p>
        {roster.coverage.matchweeks.length > 0
          ? t("{{0}} players across matchweeks {{1}}.", { 0: roster.coverage.players, 1: weeks })
          : t("{{0}} players. Matchweek coverage was not published.", {
            0: roster.coverage.players,
          })}
        {roster.coverage.shortWindow ? ` ${t("Totals cover a short window.")}` : ""}
      </p>
      <div className="team-table-wrap">
        <table className="team-table">
          <thead>
            <tr>
              <th className="is-sticky">{t("Player")}</th>
              <th className="is-sticky is-sticky-2">
                <button type="button" onClick={() => toggle("position")}>{t("Position")}</button>
              </th>
              <th className="is-sticky is-sticky-3">
                <button type="button" onClick={() => toggle("points")}>{t("FSYP")}</button>
              </th>
              {SQUAD_COLUMNS.map((key) => (
                <th key={key}>
                  <button type="button" onClick={() => toggle(key)}>{t(COLUMN_LABELS[key])}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.playerId}>
                <th className="is-sticky" scope="row">{row.name}</th>
                <td className="is-sticky is-sticky-2">{positionLabel(row.positionId) ?? "—"}</td>
                <td className="is-sticky is-sticky-3">{formatCount(row.points)}</td>
                {SQUAD_COLUMNS.map((key) => <td key={key}>{formatCount(row.stats[key])}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="is-sticky" scope="row">{t("Totals")}</th>
              <td className="is-sticky is-sticky-2" />
              <td className="is-sticky is-sticky-3" />
              {SQUAD_COLUMNS.map((key) => <td key={key}>{formatCount(roster.totals[key])}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );

  function toggle(next: SquadColumn | "position") {
    if (column === next) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setColumn(next);
      setDirection(next === "position" ? "asc" : "desc");
    }
  }
}

export function TeamInjuryList({
  injuries,
}: {
  injuries: ClubDossierDto["injuries"];
}) {
  useTranslation();
  if (!injuries) return null;
  if (!injuries.published) return <p>{t("Current injuries are not published for this club.")}</p>;
  if (injuries.items.length === 0) return <p>{t("No current injuries were published.")}</p>;
  return (
    <ul className="team-injury-list">
      {injuries.items.map((item) => (
        <li key={`${item.name}-${item.startedOn ?? ""}`} className="team-injury-card">
          <h4>{item.name}</h4>
          <dl>
            <div>
              <dt>{t("Started")}</dt>
              <dd>
                {item.startedOn ? <time dateTime={item.startedOn}>{item.startedOn}</time> : "—"}
              </dd>
            </div>
            <div>
              <dt>{t("Expected return")}</dt>
              <dd>{item.expectedReturn || "—"}</dd>
            </div>
            <div>
              <dt>{t("Injury status")}</dt>
              <dd>{item.status ? t(INJURY_LABELS[item.status] ?? item.status) : "—"}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function MvpCard({
  player,
  outlook,
}: {
  player: Roster["mvps"][number];
  outlook: {
    form?: { rating?: string | null } | null;
    startProbability?: { percent?: number | null } | null;
  } | undefined;
}) {
  const radar = usePlayerRadar(player.playerId);
  const axes = [...(radar.displayed?.axes ?? [])]
    .filter((axis) => axis.percentile != null)
    .sort((left, right) => (right.percentile ?? 0) - (left.percentile ?? 0))
    .slice(0, 3);
  return (
    <li className="team-mvp-card">
      <h4>{player.name}</h4>
      <dl>
        <div><dt>{t("FSYP")}</dt><dd>{player.points}</dd></div>
        <div><dt>{t("Form")}</dt><dd>{outlook?.form?.rating ?? "—"}</dd></div>
        <div>
          <dt>{t("Starter likelihood")}</dt>
          <dd>{outlook?.startProbability?.percent ?? "—"}</dd>
        </div>
      </dl>
      {axes.length === 0 ? <p>{t("Radar is not published for this player.")}</p> : (
        <ul>
          {axes.map((axis) => (
            <li key={axis.key}>{axis.key}: {axis.percentile} {t("Percentile")}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function toRow(player: Roster["players"][number]): SquadRow {
  return {
    playerId: player.playerId,
    name: player.name,
    positionId: player.positionId ?? null,
    points: player.points ?? null,
    stats: player.stats as SquadRow["stats"],
  };
}

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "";
}
