import { copy, i18n, language } from "../../../i18n";
import type { PlayerRadarDto, RadarProfileId } from "../../../api/radar";

const profiles: Record<RadarProfileId, string> = {
  "defense_progression_v1": "Centre-back",
  "defense_fullback_v1": "Fullback",
  "goalkeeper_v1": "Goalkeeper",
  "attacker_finishing_v1": "Striker",
  "attacker_winger_v1": "Winger",
  "midfielder_v1": "Midfielder"
};
const metrics: Record<string, readonly [string, string]> = {
  "passes_completed_p90": ["Passes cmp", "Completed passes per 90 minutes"],
  "forward_pass_completion_pct": ["Fwd pass%", "Forward pass completion percentage"],
  "progressive_passes_p90": ["Prog passes", "Progressive passes per 90 minutes"],
  "possessions_won_p90": ["Poss won", "Possessions won per 90; source definition applies"],
  "defensive_duel_win_pct": ["Def duel%", "Defensive duels won as a percentage"],
  "aerial_duel_win_pct": ["Aerial duel%", "Aerial duels won as a percentage"],
  "progressive_carries_p90": ["Prog carries", "Progressive carries per 90 minutes"],
  "crosses_completed_p90": ["Crosses cmp", "Completed crosses per 90 minutes"],
  "expected_assists_p90": ["xA", "Expected assists per 90; source model applies"],
  "save_pct": ["Save%", "Shots on target saved as a percentage"],
  "aerial_duels_won_p90": ["Aerial duels won", "Aerial duels won per 90 minutes"],
  "interceptions_padj": ["Int (PAdj)", "Possession-adjusted interceptions"],
  "long_pass_completion_pct": ["Long pass%", "Long pass completion percentage"],
  "short_pass_completion_pct": ["Short pass%", "Short/medium pass completion percentage"],
  "psxg_minus_ga_p90": ["PSxG-GA", "Post-shot expected goals minus conceded per 90"],
  "non_penalty_goals_p90": ["NPG", "Non-penalty goals per 90 minutes"],
  "non_penalty_xg_p90": ["npxG", "Non-penalty expected goals per 90; source model applies"],
  "goal_conversion_pct": ["Goal conv%", "Goal conversion percentage"],
  "touches_in_box_p90": ["Touches in box", "Touches in opposition box per 90 minutes"],
  "offensive_duels_won_p90": ["Off duels won", "Offensive duels won per 90 minutes"],
  "dribbles_completed_p90": ["Dribbles cmp", "Successful dribbles per 90 minutes"],
  "npxg_plus_xa_p90": ["npxG +xA", "Non-penalty xG plus xA per 90; source models apply"],
  "assists_p90": ["Assists", "Assists per 90 minutes"],
  "key_passes_p90": ["Key passes", "Key passes per 90; source definition applies"],
  "duel_win_pct": ["Duel%", "All duels won as a percentage"],
  "forward_passes_completed_p90": ["Fwd passes", "Completed forward passes per 90"]
};

/** Stable IDs select repository-owned definitions; unknown provider metadata stays verbatim. */
export function radarProfile(radar: Pick<PlayerRadarDto, "profile" | "profileLabel">): string {
  return copy(profiles[radar.profile] ?? radar.profileLabel);
}
export function radarMetric(axis: PlayerRadarDto["axes"][number]) {
  const known = metrics[axis.key];
  return { label: copy(known?.[0] ?? axis.label), definition: copy(known?.[1] ?? axis.definition) };
}

/** Published imports may supply prose outside the repository's translation contract. */
export function radarSourceText(value: string): string {
  if (language() === "en" || i18n.exists(value, { lng: "es", fallbackLng: false })) return copy(value);
  return copy(`Original source label: ${value}`);
}
