import { decimal } from "../../i18n/format";
import { locale } from "../../i18n";
import { t, useTranslation } from "../../i18n";
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
  fantasy: "LaLiga Fantasy",
  standings: "LaLiga standings", futbolfantasy: "FutbolFantasy",
  fantasy_catalog: "Fantasy player catalog", fantasy_market_history: "Fantasy market history",
  fantasy_calendar: "Fantasy calendar",
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
  return `${rounded > 0 ? "+" : ""}${decimal(rounded, digits)}`;
};
const ordinal = (value: number) => {
  if (locale() === "es-ES") return `${value}.º`;
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
      return Number.isFinite(number) ? t("{{0}} in LaLiga", { 0: ordinal(number) }) : value;
    case "fantasy_average":
    case "dazn_average":
      return Number.isFinite(number) ? t("{{0}} points per match", { 0: decimal(number, 2) }) : value;
    case "market_growth_and_value": {
      if (!Number.isFinite(number)) return value;
      const price = new Intl.NumberFormat(locale(), {
        style: "currency", currency: "EUR", maximumFractionDigits: 0,
      }).format(player.marketValue);
      return t("{{0}}% over five days · Current value {{1}}", { 0: signed(number * 100), 1: price });
    }
    case "owned_protection_lineup":
    case "owned_protection_trading": {
      const expiry = new Date(value.replace(" ", "T"));
      return Number.isNaN(expiry.getTime()) ? value : t("Protection expires {{0}}", { 0: new Intl.DateTimeFormat(locale(), {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(expiry) });
    }
    case "role_and_starting_probability": {
      const [role, probability] = value.split(":").map((item) => item.trim());
      return probability ? t("{{0}} · {{1}} chance of starting", { 0: t(ROLES[role] ?? readable(role)), 1: probability }) : value;
    }
    case "starting_probability":
      return Number.isFinite(number) ? t("{{0}}% chance of starting", { 0: number }) : value;
    case "squad_role":
      return t(ROLES[value] ?? readable(value));
    case "club_results": {
      const results = [...value.matchAll(/['"]([WDL])['"]/g)].map((match) =>
        ({ W: "Win", D: "Draw", L: "Loss" })[match[1] as "W" | "D" | "L"]);
      return results.length ? results.map(value => t(value)).join(" · ") : value;
    }
    case "midweek_congestion":
      return value === "True" ? t("The club has a midweek fixture") : readable(value);
    case "midweek_minutes_and_rest":
      return Number.isFinite(number) ? t("{{0}} minutes played in the midweek match", { 0: number }) : value;
    case "injury_history":
      if (value === "complete_empty") return t("No injuries in the complete recorded history");
      return Number.isFinite(number) ? t("{{0}} days since the last recorded injury began, measured at round kickoff", { 0: number }) : value;
    default:
      return t(VALUES[value] ?? readable(value));
  }
}

/** Human-readable evidence, separate score axes, and explicit source gaps. */
export function LineupBuilderScoreDetails({ player }: { player: ScoredPlayer }) {
  useTranslation();
  return <details className="lineup-builder-player-reasoning">
    <summary>
      <strong>{player.name}</strong>
      {player.protectionAdvice && <small className="lineup-builder-protection-label">{t("Protection advised")}</small>}
      <span className="lineup-builder-score-summary">
        <span className="lineup-builder-score" data-tone={builderScoreTone(player.lineupScore, "lineup")}>{t("Lineup ")}<b>{signed(player.lineupScore)}</b></span>
        <span className="lineup-builder-score" data-tone={builderScoreTone(player.tradingScore, "trading")}>{t("Trading ")}<b>{signed(player.tradingScore)}</b></span>
        <span className="lineup-builder-score" data-tone={builderScoreTone(player.combinedScore, "combined")}>{t("Combined ")}<b>{signed(player.combinedScore)}</b></span>
      </span>
    </summary>
    {player.protectionAdvice && <p className="lineup-builder-protection-advice">
      {t("Protection expires shortly before kickoff. Consider protecting the player before the round starts.")}</p>}
    <div className="lineup-builder-score-sections">
      {player.sections.map((section) => <section key={section.section} className="lineup-builder-score-section">
        <h5>{t(SECTION_LABELS[section.section] ?? readable(section.section))}</h5>
        <p className="lineup-builder-section-impact">
          {section.effectiveWeight > 0 ? t("Lineup contribution {{0}} · Weight {{1}}%", { 0: signed(section.lineupNormalized * section.effectiveWeight, 3), 1: decimal(section.effectiveWeight * 100, 1) }) : t("Not used in the lineup score")}
          {(section.criteria.some((rule) => rule.trading !== null) && t(" · Trading contribution {{0}}", { 0: signed(section.tradingNormalized, 3) }))}
        </p>
        {section.criteria.length > 0 ? <ul className="lineup-builder-rule-list">
          {section.criteria.map((rule) => <li key={rule.ruleId}>
            <div>
              <strong>{t(RULE_LABELS[rule.ruleId] ?? readable(rule.ruleId))}</strong>
              <p>{observedFact(rule, player)}</p>
              {rule.ruleId === "market_growth_and_value" && <small>{t("The rule considers both price growth and current value.")}</small>}
              <small>{t("Source: ")}{t(SOURCES[rule.source] ?? readable(rule.source))}</small>
            </div>
            <span className="lineup-builder-rule-points">
              {rule.lineup !== null && <span>{t("Lineup ")}{signed(rule.lineup, 0)} {t(" rule pts")}</span>}
              {rule.trading !== null && <span>{t("Trading ")}{signed(rule.trading, 0)} {t(" rule pts")}</span>}
            </span>
          </li>)}
        </ul> : <p className="fb-helper">{t("No usable evidence for this category.")}</p>}
      </section>)}
    </div>
    <section className="lineup-builder-missing-data" aria-label={t("Missing data for {{0}}", { 0: player.name })}>
      <h5>{t("Data not included")}</h5>
      {player.omissions.length > 0 ? <>
        <ul>{[...new Set(player.omissions)].map((omission) => <li key={omission}>
          {OMISSIONS[omission] ? t(OMISSIONS[omission]) : t("{{0}} is unavailable", { 0: t(RULE_LABELS[omission] ?? readable(omission)) })}
        </li>)}</ul>
        <p className="fb-helper">{t("Unavailable criteria are left out. When a whole lineup category has no usable evidence, its weight is redistributed across the remaining categories.")}</p>
      </> : <p>{t("No missing scoring criteria were reported.")}</p>}
    </section>
  </details>;
}
