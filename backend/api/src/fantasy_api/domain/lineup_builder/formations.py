"""Validated formation capacities for lineup constraints and ranking."""

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fantasy_api.schemas.lineup_builder import ScoredPlayer


@dataclass(frozen=True, slots=True)
class FormationSpec:
    """Parsed lineup shape, ordered by goalkeeper, defender, midfielder and forward."""

    code: str
    capacities: tuple[int, int, int, int]

    @classmethod
    def parse(cls, code: str) -> "FormationSpec":
        """Parse the public three-number formation code once."""
        defenders, midfielders, forwards = (int(value) for value in code.split(","))
        return cls(code=code, capacities=(1, defenders, midfielders, forwards))

    @property
    def midfielders(self) -> int:
        """Return the midfield capacity used for the existing ranking tie-break."""
        return self.capacities[2]

    def fits(self, players: list["ScoredPlayer"]) -> bool:
        """Return whether every required player fits the formation's position slots."""
        counts = [0, 0, 0, 0]
        for player in players:
            counts[player.position - 1] += 1
        return all(
            count <= capacity for count, capacity in zip(counts, self.capacities, strict=True)
        )
