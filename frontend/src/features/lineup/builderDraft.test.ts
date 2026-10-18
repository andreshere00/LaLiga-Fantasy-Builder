import { describe, expect, it } from "vitest";
import response from "../../../../contracts/lineup-builder-response.json";
import { lineupBuildResponseSchema, serializeEndpointRequest } from "../../api/schemas";
import type { SquadCard } from "../../api/mappers";
import { builderDraft } from "./builderDraft";

const candidate = lineupBuildResponseSchema.parse(response.payload).candidates[0];
const squad: SquadCard[] = candidate.starters.map((p) => ({ id: `new-slot-${p.playerId}`, masterPlayerId: p.playerId, name: p.name,
  positionId: p.position, captain: false, photoUrl: null, teamBadgeUrl: null, marketValue: p.marketValue,
  onMarket: false, listingId: null, salePrice: null }));

describe("builderDraft", () => {
  it("should map master ids to refreshed squad-entry ids", () => {
    const draft = builderDraft(candidate, squad, [candidate.formation]);
    expect(draft?.goalkeeper[0]).toMatch(/^new-slot-/);
    expect(Object.values(draft ?? {}).flat()).not.toContain(candidate.starters[0].playerId);
  });
  it("should reject missing ownership, duplicate players and unsupported formations", () => {
    expect(builderDraft(candidate, squad.slice(1), [candidate.formation])).toBeNull();
    expect(builderDraft(candidate, squad, [])).toBeNull();
    expect(builderDraft({ ...candidate, starters: [...candidate.starters.slice(1), candidate.starters[1]] }, squad, [candidate.formation])).toBeNull();
  });
  it("should serialize builder preferences to snake-case wire keys", () => {
    expect(serializeEndpointRequest("POST", "/api/lineup-builder/leagues/l1/build", {
      sources: ["owned"], mandatoryPlayerIds: ["1"], formations: [], allowBuying: false,
      allowSelling: false, includeTradingPurchases: false, maxCandidates: 5, explanation: { enabled: false },
    })).toMatchObject({ mandatory_player_ids: ["1"], allow_buying: false, max_candidates: 5 });
  });
});
