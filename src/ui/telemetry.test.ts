import { describe, expect, it } from "vitest";
import { activePlayDeltaMs, milestoneDurationMinutes, progressionCandidates } from "./telemetry";

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

  it("counts only active tick time and clamps sleeping tabs or clock rollbacks", () => {
    expect(activePlayDeltaMs(1_000, 1_200)).toBe(200);
    expect(activePlayDeltaMs(1_000, 121_000)).toBe(1_000);
    expect(activePlayDeltaMs(121_000, 1_000)).toBe(0);
    expect(activePlayDeltaMs(1_000, 1_200, false)).toBe(0);
    expect(activePlayDeltaMs(Number.NaN, 1_000)).toBe(0);
  });

  it("reports milestone durations in privacy-preserving half-minute buckets", () => {
    expect(milestoneDurationMinutes(1)).toBe(0.5);
    expect(milestoneDurationMinutes(74_000)).toBe(1);
    expect(milestoneDurationMinutes(76_000)).toBe(1.5);
    expect(milestoneDurationMinutes(0)).toBe(0);
  });
});
