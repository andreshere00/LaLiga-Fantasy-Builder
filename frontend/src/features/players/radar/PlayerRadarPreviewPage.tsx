import { useState } from "react";
import { Link } from "react-router-dom";
import { playerRadarResponseSchema } from "../../../api/schemas";
import { PlayerRadarPlot } from "./PlayerRadarPlot";
import examples from "./examples.json";
import "../PlayerDetailPage.css";

export const suppliedRadars = examples.map((radar) => playerRadarResponseSchema.parse({
  player_id: radar.player_id, season: radar.season, available_seasons: [radar.season],
  status: "available", reason: null, radars: [radar], comparison: null, comparison_reason: null, compatible_players: [],
}).radars[0]);

/** Clearly separated examples: no sample is attached to a real Fantasy player id. */
export function PlayerRadarPreviewPage() {
  const [id, setId] = useState(suppliedRadars[0].playerId);
  const selected = suppliedRadars.find((r) => r.playerId === id)!;
  return <section className="player-detail-page player-radar-preview">
    <nav className="fb-breadcrumb" aria-label="Breadcrumb"><Link to="/players">Players</Link><span aria-hidden="true"> / </span><span>Radar examples</span></nav>
    <header className="player-detail-panel"><p className="player-radar-eyebrow">Imported preview · 2026/27</p>
      <h1>Player performance radars</h1><p>The six supplied examples. These are not live statistics or verified Fantasy identities.</p>
      <label className="player-radar-preview-select">Example player<select value={id} onChange={(e) => setId(e.target.value)}>
        {["Defense", "Goalkeeper", "Attacker", "Midfielder"].map((position) => <optgroup key={position} label={position}>
          {suppliedRadars.filter((r) => r.position === position).map((r) => <option key={r.playerId} value={r.playerId}>{r.player} · {r.profileLabel}</option>)}
        </optgroup>)}
      </select></label>
    </header>
    <div className="player-detail-panel"><PlayerRadarPlot key={selected.playerId} radar={selected} />
      <p className="player-radar-context">{selected.comparisonReason} Each supplied player also has a different seven-axis profile.</p>
    </div>
  </section>;
}
