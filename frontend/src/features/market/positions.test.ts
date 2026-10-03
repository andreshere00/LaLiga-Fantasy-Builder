import { describe, expect, it } from "vitest";

import { positionAbbrev, positionLabel } from "./positions";

describe("positionLabel", () => {
  it("positionLabel_maps_outfield_roles", () => {
    expect(positionAbbrev(1)).toBe("GKP");
    expect(positionLabel(1)).toBe("Goalkeeper");
    expect(positionAbbrev(4)).toBe("ATK");
    expect(positionLabel(4)).toBe("Attacker");
  });

  it("positionLabel_unknown_id_returns_null", () => {
    expect(positionLabel(99)).toBeNull();
    expect(positionLabel(null)).toBeNull();
  });
});
