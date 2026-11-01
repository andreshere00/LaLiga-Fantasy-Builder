"""Versioned seven-spoke definitions; labels never identify a metric."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    """Ordered radar definition shared by all observations of a profile."""

    position: str
    label: str
    metrics: tuple[tuple[str, str, str], ...]


PASSES = ("passes_completed_p90", "Passes cmp", "Completed passes per 90 minutes")
FWD_PCT = ("forward_pass_completion_pct", "Fwd pass%", "Forward pass completion percentage")
PROG_PASSES = ("progressive_passes_p90", "Prog passes", "Progressive passes per 90 minutes")
POSS = ("possessions_won_p90", "Poss won", "Possessions won per 90; source definition applies")
DEF_DUEL = ("defensive_duel_win_pct", "Def duel%", "Defensive duels won as a percentage")
AERIAL = ("aerial_duel_win_pct", "Aerial duel%", "Aerial duels won as a percentage")
CARRIES = ("progressive_carries_p90", "Prog carries", "Progressive carries per 90 minutes")
CROSSES = ("crosses_completed_p90", "Crosses cmp", "Completed crosses per 90 minutes")
XA = ("expected_assists_p90", "xA", "Expected assists per 90; source model applies")
NPG = ("non_penalty_goals_p90", "NPG", "Non-penalty goals per 90 minutes")
NPXG = ("non_penalty_xg_p90", "npxG", "Non-penalty expected goals per 90; source model applies")
KEY = ("key_passes_p90", "Key passes", "Key passes per 90; source definition applies")

PROFILES: dict[str, Profile] = {
    "defense_progression_v1": Profile(
        "Defense",
        "Progression defense",
        (PASSES, FWD_PCT, PROG_PASSES, POSS, DEF_DUEL, AERIAL, CARRIES),
    ),
    "defense_fullback_v1": Profile(
        "Defense", "Fullback", (CROSSES, XA, PROG_PASSES, POSS, DEF_DUEL, AERIAL, CARRIES)
    ),
    "goalkeeper_v1": Profile(
        "Goalkeeper",
        "Goalkeeper",
        (
            ("save_pct", "Parada%", "Shots on target saved as a percentage"),
            ("aerial_duels_won_p90", "Aéreos ganados", "Aerial duels won per 90 minutes"),
            ("interceptions_padj", "Int (PAdj)", "Possession-adjusted interceptions"),
            (PASSES[0], "Pases cmp", PASSES[2]),
            ("long_pass_completion_pct", "Largo%", "Long pass completion percentage"),
            ("short_pass_completion_pct", "Corto%", "Short/medium pass completion percentage"),
            ("psxg_minus_ga_p90", "PSxG-GA", "Post-shot expected goals minus conceded per 90"),
        ),
    ),
    "attacker_finishing_v1": Profile(
        "Attacker",
        "Finishing attacker",
        (
            NPG,
            NPXG,
            ("goal_conversion_pct", "Goal conv%", "Goal conversion percentage"),
            (AERIAL[0], "Aerial%", AERIAL[2]),
            ("touches_in_box_p90", "Touches in box", "Touches in opposition box per 90 minutes"),
            XA,
            ("offensive_duels_won_p90", "Off duels won", "Offensive duels won per 90 minutes"),
        ),
    ),
    "attacker_winger_v1": Profile(
        "Attacker",
        "Winger",
        (
            CARRIES,
            ("dribbles_completed_p90", "Dribbles cmp", "Successful dribbles per 90 minutes"),
            NPG,
            ("npxg_plus_xa_p90", "npxG +xA", "Non-penalty xG plus xA per 90; source models apply"),
            ("assists_p90", "Assists", "Assists per 90 minutes"),
            KEY,
            CROSSES,
        ),
    ),
    "midfielder_v1": Profile(
        "Midfielder",
        "Midfielder",
        (
            ("duel_win_pct", "Duel%", "All duels won as a percentage"),
            POSS,
            CARRIES,
            ("forward_passes_completed_p90", "Fwd passes", "Completed forward passes per 90"),
            FWD_PCT,
            KEY,
            PROG_PASSES,
        ),
    ),
}
