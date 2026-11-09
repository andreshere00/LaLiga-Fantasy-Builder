import { describe, expect, it } from "vitest";
import { pitchLine, pitchLines } from "./teamPitch";

describe("pitchLines", () => {
  it("pitchLines_puts_the_goalkeeper_at_the_bottom", () => {
    const lines = pitchLines([
      { name: "Keeper", position: "Portero" },
      { name: "Left back", position: "Defensa" },
      { name: "Right back", position: "Defensa" },
      { name: "Mid", position: "Mediocampista" },
      { name: "Striker", position: "Delantero" },
    ]);
    expect(lines.map((line) => line.line)).toEqual([
      "delantero", "mediocampista", "defensa", "portero",
    ]);
    expect(lines.at(-1)?.players.map((player) => player.name)).toEqual(["Keeper"]);
    expect(pitchLine("Goalkeeper")).toBe("portero");
  });
});
