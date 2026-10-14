import type { BuilderCandidate } from "../../api/schemas";
import { builderScoreTone } from "./builderScoreTone";

type ScoredPlayer = BuilderCandidate["starters"][number];
type Criterion = ScoredPlayer["sections"][number]["criteria"][number];

const SECTION_LABELS: Record<string, string> = {
  basic: "Club standing and availability",
  indicators: "Role, fitness and form",
  recent: "Recent match performance",
  market: "Market value and protection",
  fixtures: "Fixtures and opponent difficulty",
  injury: "Injury history and recovery",
};
const RULE_LABELS: Record<string, string> = {
  club_position: "Club league position", fantasy_average: "Season Fantasy average",
  availability: "Availability", injury_risk: "Injury risk",
  role_and_starting_probability: "Role and chance of starting",
  starting_probability: "Chance of starting", squad_role: "Squad role", form: "Current form",
  dazn_average: "Recent DAZN average", market_growth_and_value: "Market trend and price",
  owned_protection_lineup: "Protection effect on selection",
  owned_protection_trading: "Protection effect on trading", club_results: "Recent club results",
  midweek_congestion: "Midweek fixture congestion", midweek_minutes_and_rest: "Midweek minutes and rest",
  weather: "Match-day weather", opponent_position: "Opponent league position",
  injury_history: "Time since last injury", injury_recovery: "Injury recovery",
};
const SOURCES: Record<string, string> = {
  standings: "LaLiga standings", futbolfantasy: "FutbolFantasy",
  fantasy_catalog: "Fantasy player catalog", fantasy_market_history: "Fantasy market history",
  fantasy_roster: "Your Fantasy squad", openweather: "OpenWeather",
};
const ROLES: Record<string, string> = {
  Dios: "Star player", Clave: "Key player", Importante: "Important player",
  Rotación: "Rotation player", Revulsivo: "Impact substitute", Reserva: "Reserve player",
};
const VALUES: Record<string, string> = {
  available: "Available", questionable: "Doubtful", recovering: "Recovering from injury",
  low: "Low", medium: "Medium", high: "High", unknown: "Unknown",
  bad: "Poor form", very_bad: "Very poor form", mid: "Average form",
  good: "Good form", very_good: "Very good form",
};
const OMISSIONS: Record<string, string> = {
  injury_history_unknown: "Complete injury history is unavailable",
  owned_protection_unknown: "Protection expiry is unavailable",
  not_eligible_as_starter: "This player is not eligible for the starting XI",
};

const readable = (value: string) => value.replaceAll("_", " ");
const signed = (value: number, digits = 2) => {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
};
const ordinal = (value: number) => {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
  return `${value}${suffix}`;
};

/** Translate recorded evidence without inferring facts missing from the response. */
function observedFact(rule: Criterion, player: ScoredPlayer): string {
  const value = rule.observed;
  const number = value.trim() ? Number(value) : NaN;
  switch (rule.ruleId) {
    case "club_position":
    case "opponent_position":
      return Number.isFinite(number) ? `${ordinal(number)} in LaLiga` : value;
    case "fantasy_average":
    case "dazn_average":
      return Number.isFinite(number) ? `${number.toFixed(2)} points per match` : value;
    case "market_growth_and_value": {
      if (!Number.isFinite(number)) return value;
      const price = new Intl.NumberFormat(undefined, {
        style: "currency", currency: "EUR", maximumFractionDigits: 0,
      }).format(player.marketValue);
      return `${signed(number * 100)}% over five days · Current value ${price}`;
    }
    case "owned_protection_lineup":
    case "owned_protection_trading": {
      const expiry = new Date(value.replace(" ", "T"));
      return Number.isNaN(expiry.getTime()) ? value : `Protection expires ${new Intl.DateTimeFormat(undefined, {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(expiry)}`;
    }
    case "role_and_starting_probability": {
      const [role, probability] = value.split(":").map((item) => item.trim());
      return probability ? `${ROLES[role] ?? readable(role)} · ${probability} chance of starting` : value;
    }
    case "starting_probability":
      return Number.isFinite(number) ? `${number}% chance of starting` : value;
    case "squad_role":
      return ROLES[value] ?? readable(value);
    case "club_results": {
      const results = [...value.matchAll(/['"]([WDL])['"]/g)].map((match) =>
        ({ W: "Win", D: "Draw", L: "Loss" })[match[1] as "W" | "D" | "L"]);
      return results.length ? results.join(" · ") : value;
    }
    case "midweek_congestion":
      return value === "True" ? "The club has a midweek fixture" : readable(value);
    case "midweek_minutes_and_rest":
      return Number.isFinite(number) ? `${number} minutes played in the midweek match` : value;
    case "injury_history":
      if (value === "complete_empty") return "No injuries in the complete recorded history";
      return Number.isFinite(number)
        ? `${number} days since the last recorded injury began, measured at round kickoff`
        : value;
    default:
      return VALUES[value] ?? readable(value);
  }
}

/** Human-readable evidence, separate score axes, and explicit source gaps. */
export function LineupBuilderScoreDetails({ player }: { player: ScoredPlayer }) {
  return <details className="lineup-builder-player-reasoning">
    <summary>
      <strong>{player.name}</strong>
      {player.protectionAdvice && <small className="lineup-builder-protection-label">Protection advised</small>}
      <span className="lineup-builder-score-summary">
        <span className="lineup-builder-score" data-tone={builderScoreTone(player.lineupScore, "lineup")}>Lineup <b>{signed(player.lineupScore)}</b></span>
        <span className="lineup-builder-score" data-tone={builderScoreTone(player.tradingScore, "trading")}>Trading <b>{signed(player.tradingScore)}</b></span>
        <span className="lineup-builder-score" data-tone={builderScoreTone(player.combinedScore, "combined")}>Combined <b>{signed(player.combinedScore)}</b></span>
      </span>
    </summary>
    {player.protectionAdvice && <p className="lineup-builder-protection-advice">
      Protection expires shortly before kickoff. Consider protecting the player before the round starts.
    </p>}
    <div className="lineup-builder-score-sections">
      {player.sections.map((section) => <section key={section.section} className="lineup-builder-score-section">
        <h5>{SECTION_LABELS[section.section] ?? readable(section.section)}</h5>
        <p className="lineup-builder-section-impact">
          {section.effectiveWeight > 0
            ? `Lineup contribution ${signed(section.lineupNormalized * section.effectiveWeight, 3)} · Weight ${(section.effectiveWeight * 100).toFixed(1)}%`
            : "Not used in the lineup score"}
          {section.criteria.some((rule) => rule.trading !== null) &&
            ` · Trading contribution ${signed(section.tradingNormalized, 3)}`}
        </p>
        {section.criteria.length > 0 ? <ul className="lineup-builder-rule-list">
          {section.criteria.map((rule) => <li key={rule.ruleId}>
            <div>
              <strong>{RULE_LABELS[rule.ruleId] ?? readable(rule.ruleId)}</strong>
              <p>{observedFact(rule, player)}</p>
              {rule.ruleId === "market_growth_and_value" && <small>The rule considers both price growth and current value.</small>}
              <small>Source: {SOURCES[rule.source] ?? readable(rule.source)}</small>
            </div>
            <span className="lineup-builder-rule-points">
              {rule.lineup !== null && <span>Lineup {signed(rule.lineup, 0)} rule pts</span>}
              {rule.trading !== null && <span>Trading {signed(rule.trading, 0)} rule pts</span>}
            </span>
          </li>)}
        </ul> : <p className="fb-helper">No usable evidence for this category.</p>}
      </section>)}
    </div>
    <section className="lineup-builder-missing-data" aria-label={`Missing data for ${player.name}`}>
      <h5>Data not included</h5>
      {player.omissions.length > 0 ? <>
        <ul>{[...new Set(player.omissions)].map((omission) => <li key={omission}>
          {OMISSIONS[omission] ?? `${RULE_LABELS[omission] ?? readable(omission)} is unavailable`}
        </li>)}</ul>
        <p className="fb-helper">Unavailable criteria are left out. When a whole lineup category has no usable evidence, its weight is redistributed across the remaining categories.</p>
      </> : <p>No missing scoring criteria were reported.</p>}
    </section>
  </details>;
}
