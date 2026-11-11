import { describe, expect, it } from "vitest";
import { preloadHandlers, routeForPath } from "./routeModules";

describe("routeForPath", () => {
  it("knownSections_mapToTheirChunk", () => {
    expect(routeForPath("/market")).toBe("/market");
    expect(routeForPath("/teams/12")).toBe("/teams");
    expect(routeForPath("/players?pos=2")).toBe("/players");
    expect(routeForPath("/players/53")).toBe("/player");
  });

  it("lineupAndUnknown_haveNoChunk", () => {
    expect(routeForPath("/")).toBeNull();
    expect(routeForPath("/account")).toBeNull();
    expect(preloadHandlers("/")).toEqual({});
  });
});
