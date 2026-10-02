import { useEffect, useState, type ReactElement } from "react";

import { formatTeamValue, pointsLabel } from "../../api/mappers";
import { useAuth } from "../../auth/AuthProvider";
import { GatePanel } from "../gates/GatePanel";
import { PlayerScoreBadge, PlayerTile } from "../lineup/PlayerTile";
import { CheckIcon, CrossIcon, QuestionIcon } from "../shell/icons";
import {
  positionAbbrev,
  formDisplayPoints,
  positionTone,
  remainingLabel,
  type Availability,
  type MarketRow,
} from "./marketRows";
import { useMarketBoard } from "./useMarketBoard";
import "../lineup/LineupPage.css";
import "./MarketPage.css";

const SEAL_TICK_MS = 60_000;

const AVAILABILITY: Record<Availability, { label: string; icon: () => ReactElement }> = {
  available: { label: "Available", icon: CheckIcon },
  questionable: { label: "Questionable", icon: QuestionIcon },
  unavailable: { label: "Not available", icon: CrossIcon },
};

function variationPercentLabel(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

function variationAbsoluteLabel(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("es-ES").format(value)} €`;
}

function variationPercentTone(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "is-flat";
  if (value > 1) return "is-up";
  if (value >= 0) return "is-mid";
  return "is-down";
}

function averageLabel(value: number | null): string {
  return value == null ? "—" : value.toFixed(2);
}

function FormCell({ row }: { row: MarketRow }) {
  const scores = formDisplayPoints(row.formRecent);
  if (scores.length === 0) return <>—</>;
  return (
    <span className="market-form-badges" aria-label={`Form: ${scores.join(", ")} points`}>
      {scores.map((points, index) => (
        <PlayerScoreBadge key={`${row.id}-form-${index}`} points={points} />
      ))}
    </span>
  );
}

function marketValueLabel(
  marketValue: number | null,
  variation: number | null,
  variationPercent: number | null,
): ReactElement {
  const absolute = variationAbsoluteLabel(variation);
  const percent = variationPercentLabel(variationPercent);
  const tone = variationPercentTone(variationPercent);
  if (!absolute && !percent) {
    return <span className="market-value-primary">{formatTeamValue(marketValue)}</span>;
  }
  return (
    <span className="market-value-line">
      <span className="market-value-primary">{formatTeamValue(marketValue)}</span>
      <span className="market-value-sep"> · </span>
      <span className={`market-value-change ${tone}`}>
        {absolute}
        {percent ? ` (${percent})` : null}
      </span>
    </span>
  );
}

function MarketListRow({ row, now }: { row: MarketRow; now: number }) {
  const { label, icon: Icon } = AVAILABILITY[row.availability];
  const tone = positionTone(row.positionId);
  return (
    <li className="market-row">
      <div className="market-card">
        <PlayerTile
          name={row.name}
          captain={false}
          variant="squad"
          photoUrl={row.photoUrl}
          teamBadgeUrl={row.teamBadgeUrl}
        />
      </div>
      <span className="market-name" data-label="Player">
        {row.name}
      </span>
      <span className="market-cell" data-label="Position">
        <span className={`market-position-badge is-${tone}`}>
          {positionAbbrev(row.positionId)}
        </span>
      </span>
      <span className="market-cell" data-label="FSYP">
        {pointsLabel(row.points)}
      </span>
      <span className="market-cell market-form" data-label="Form">
        <FormCell row={row} />
      </span>
      <span className="market-cell market-value" data-label="Market value">
        {marketValueLabel(row.marketValue, row.variation, row.variationPercent)}
      </span>
      <span className={`market-cell market-availability is-${row.availability}`}>
        <Icon />
        <span>{label}</span>
      </span>
      <span className="market-cell" data-label="Average">
        {averageLabel(row.averagePoints)}
      </span>
      <span className="market-cell" data-label="Seal ends on">
        {remainingLabel(row.expiresAt, now)}
      </span>
      <span className="market-cell market-seller" data-label="Seller">
        {row.seller}
      </span>
    </li>
  );
}

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), SEAL_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function MarketList() {
  const board = useMarketBoard();
  const now = useMinuteClock();
  if (board.isLoading) return <p className="status-copy">Loading market…</p>;
  if (board.noLeague) return <p className="status-copy">No leagues found for this account.</p>;
  if (board.hasError) {
    return (
      <p className="status-copy" role="alert">
        The market could not be loaded.
      </p>
    );
  }
  if (board.rows.length === 0) return <p className="status-copy">No players on the market.</p>;
  return (
    <ul className="market-list">
      <li className="market-row market-head" aria-hidden="true">
        <span className="market-head-player">Player</span>
        <span>Position</span>
        <span>FSYP</span>
        <span>Form</span>
        <span>Market value</span>
        <span>Availability</span>
        <span>Average</span>
        <span>Seal ends on</span>
        <span>Seller</span>
      </li>
      {board.rows.map((row) => (
        <MarketListRow key={row.id} row={row} now={now} />
      ))}
    </ul>
  );
}

export function MarketPage() {
  const { status } = useAuth();
  if (status !== "ready") return <GatePanel status={status} />;
  return (
    <section className="market-page">
      <h1>Market</h1>
      <MarketList />
    </section>
  );
}
