import { describe, expect, it } from "vitest";
import { computeEffectiveStat } from "./modifiers";
import { synergyMultiplier, defaultSynergyConfig } from "./synergy";
import { applyPrestige, canUnlockAnime, createInitialPrestigeState, unlockAnime } from "./prestige";
import { getUnlockedAbilities, isAbilityReady } from "./abilities";
import { recruitCost } from "./economy";
import { animeTier, arcGoal, canEnterNewAnime, isAnimeComplete, isArcUnlocked } from "./progression";
import type { ActiveModifier, Arc, Character, ComboDefinition } from "./types";

describe("computeEffectiveStat", () => {
  it("applies flat, then percent, then multiplier in order", () => {
    const modifiers: ActiveModifier[] = [
      { id: "m1", sourceId: "s1", target: "clickPower", kind: "flat", value: 5 },
      { id: "m2", sourceId: "s2", target: "clickPower", kind: "percent", value: 0.5 },
      { id: "m3", sourceId: "s3", target: "clickPower", kind: "multiplier", value: 2 },
    ];
    // (0 + 5) * (1 + 0.5) * 2 = 15
    expect(computeEffectiveStat(0, "clickPower", modifiers, 0)).toBe(15);
  });

  it("ignores expired modifiers", () => {
    const modifiers: ActiveModifier[] = [
      { id: "m1", sourceId: "s1", target: "clickPower", kind: "flat", value: 5, expiresAt: 100 },
    ];
    expect(computeEffectiveStat(0, "clickPower", modifiers, 200)).toBe(0);
    expect(computeEffectiveStat(0, "clickPower", modifiers, 50)).toBe(5);
  });

  it("ignores modifiers targeting a different stat", () => {
    const modifiers: ActiveModifier[] = [
      { id: "m1", sourceId: "s1", target: "passiveIncome", kind: "flat", value: 5 },
    ];
    expect(computeEffectiveStat(10, "clickPower", modifiers, 0)).toBe(10);
  });
});

describe("synergyMultiplier", () => {
  const arc: Arc = { id: "arc-1", animeId: "anime-1", name: "Arc 1", order: 0, baseGoal: 100 };

  it("gives the bonus when the character's arc matches", () => {
    const char: Character = {
      id: "c1",
      name: "C1",
      animeId: "anime-1",
      arcIds: ["arc-1"],
      baseClickPower: 1,
      basePassiveIncome: 0,
    };
    expect(synergyMultiplier(char, arc, defaultSynergyConfig)).toBe(defaultSynergyConfig.matchingArcMultiplier);
  });

  it("gives the same-anime malus when same anime but different arc", () => {
    const char: Character = {
      id: "c2",
      name: "C2",
      animeId: "anime-1",
      arcIds: ["arc-2"],
      baseClickPower: 1,
      basePassiveIncome: 0,
    };
    expect(synergyMultiplier(char, arc, defaultSynergyConfig)).toBe(defaultSynergyConfig.sameAnimeMalus);
  });

  it("gives the other-anime malus when from a different anime", () => {
    const char: Character = {
      id: "c3",
      name: "C3",
      animeId: "anime-2",
      arcIds: ["arc-9"],
      baseClickPower: 1,
      basePassiveIncome: 0,
    };
    expect(synergyMultiplier(char, arc, defaultSynergyConfig)).toBe(defaultSynergyConfig.otherAnimeMalus);
  });
});

describe("prestige", () => {
  it("computes no gain below the scale threshold", () => {
    expect(applyPrestige(createInitialPrestigeState(), 999).prestigePoints).toBe(0);
  });

  it("computes diminishing-returns gain above the scale threshold", () => {
    const state = applyPrestige(createInitialPrestigeState(), 4_000_000);
    expect(state.prestigePoints).toBe(2); // floor(sqrt(4_000_000 / 1_000_000))
  });

  it("lets the player unlock any anime they can afford, in any order", () => {
    let state = createInitialPrestigeState();
    state = { ...state, prestigePoints: 10 };
    expect(canUnlockAnime(state, "anime-b", 5)).toBe(true);
    state = unlockAnime(state, "anime-b", 5);
    expect(state.unlockedAnimeIds).toContain("anime-b");
    expect(state.prestigePoints).toBe(5);
  });

  it("refuses to unlock the same anime twice or without enough points", () => {
    let state = createInitialPrestigeState();
    state = { ...state, prestigePoints: 5 };
    state = unlockAnime(state, "anime-b", 5);
    expect(canUnlockAnime(state, "anime-b", 5)).toBe(false); // already unlocked
    expect(canUnlockAnime(state, "anime-c", 100)).toBe(false); // too expensive
  });
});

describe("abilities", () => {
  const characters: Character[] = [
    {
      id: "c1",
      name: "C1",
      animeId: "anime-1",
      arcIds: [],
      baseClickPower: 1,
      basePassiveIncome: 0,
      ability: { id: "ab-solo", name: "Solo", cooldownMs: 1000, durationMs: 500, effects: [] },
    },
    { id: "c2", name: "C2", animeId: "anime-1", arcIds: [], baseClickPower: 1, basePassiveIncome: 0 },
  ];
  const combos: ComboDefinition[] = [
    {
      id: "combo-1",
      name: "Combo",
      requiredCharacterIds: ["c1", "c2"],
      ability: { id: "ab-combo", name: "Combo Ability", cooldownMs: 1000, durationMs: 500, effects: [] },
    },
  ];

  it("unlocks a solo ability when its character is owned", () => {
    const unlocked = getUnlockedAbilities(["c1"], characters, combos);
    expect(unlocked.map((u) => u.ability.id)).toEqual(["ab-solo"]);
  });

  it("unlocks a combo ability only once every required character is owned", () => {
    expect(getUnlockedAbilities(["c1"], characters, combos).map((u) => u.ability.id)).toEqual(["ab-solo"]);
    const unlocked = getUnlockedAbilities(["c1", "c2"], characters, combos);
    expect(unlocked.map((u) => u.ability.id).sort()).toEqual(["ab-combo", "ab-solo"]);
  });

  it("tracks cooldown readiness", () => {
    expect(isAbilityReady(undefined, 1000, 0)).toBe(true);
    expect(isAbilityReady(0, 1000, 500)).toBe(false);
    expect(isAbilityReady(0, 1000, 1000)).toBe(true);
  });
});

describe("recruitCost", () => {
  const cheap: Character = {
    id: "cheap", name: "Cheap", animeId: "a", arcIds: [], baseClickPower: 1, basePassiveIncome: 0,
  };
  const strong: Character = {
    id: "strong", name: "Strong", animeId: "a", arcIds: [], baseClickPower: 3, basePassiveIncome: 2,
  };

  it("charges more for a stronger character", () => {
    expect(recruitCost(strong, 0)).toBeGreaterThan(recruitCost(cheap, 0));
  });

  it("scales up with the size of the roster", () => {
    expect(recruitCost(cheap, 3)).toBeGreaterThan(recruitCost(cheap, 0));
  });
});

describe("world progression", () => {
  const arcs: Arc[] = [
    { id: "a1", animeId: "a", name: "A1", order: 0, baseGoal: 100 },
    { id: "a2", animeId: "a", name: "A2", order: 1, baseGoal: 200 },
    { id: "b1", animeId: "b", name: "B1", order: 0, baseGoal: 100 },
  ];

  it("makes a later-entered anime harder", () => {
    expect(arcGoal(arcs[0], 0)).toBe(100);
    expect(arcGoal(arcs[0], 1)).toBeGreaterThan(100);
  });

  it("freezes an anime's difficulty at the tier it was entered", () => {
    const unlocked = ["a", "b"];
    expect(animeTier(unlocked, "a")).toBe(0);
    expect(animeTier(unlocked, "b")).toBe(1);
  });

  it("opens an arc only once the previous one of the same anime is cleared", () => {
    expect(isArcUnlocked(arcs, arcs[1], {}, 0)).toBe(false);
    expect(isArcUnlocked(arcs, arcs[1], { a1: 100 }, 0)).toBe(true);
    expect(isArcUnlocked(arcs, arcs[0], {}, 0)).toBe(true);
  });

  it("completes an anime only when every one of its arcs is cleared", () => {
    expect(isAnimeComplete(arcs, "a", { a1: 100 }, 0)).toBe(false);
    expect(isAnimeComplete(arcs, "a", { a1: 100, a2: 200 }, 0)).toBe(true);
  });

  it("lets the player pick a first world, then blocks travel until the current one is done", () => {
    expect(canEnterNewAnime([], arcs, {})).toBe(true);
    expect(canEnterNewAnime(["a"], arcs, { a1: 100 })).toBe(false);
    expect(canEnterNewAnime(["a"], arcs, { a1: 100, a2: 200 })).toBe(true);
  });
});
