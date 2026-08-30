import { describe, expect, it } from "vitest";
import { progressionCandidates } from "./telemetry";

describe("anonymous progression milestones", () => {
  it("emits only thresholds the aggregate facts have reached", () => {
    const reached = progressionCandidates({
      worlds: 2,
      recruits: 4,
      arcs: 7,
      items: 1,
      passiveRanks: 0,
      abilities: 3,
      prestiges: 1,
    })
      .filter((candidate) => candidate.reached)
      .map((candidate) => candidate.key);

    expect(reached).toEqual([
      "world_1",
      "world_2",
      "recruit_1",
      "arc_1",
      "arc_5",
      "item_1",
      "ability_1",
      "prestige_1",
    ]);
  });
});
