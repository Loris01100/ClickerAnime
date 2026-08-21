import { describe, expect, it } from "vitest";
import { computeEffectiveStat } from "./modifiers";
import { synergyMultiplier, defaultSynergyConfig } from "./synergy";
import { applyPrestige, canUnlockAnime, createInitialPrestigeState, unlockAnime } from "./prestige";
import { getUnlockedAbilities, isAbilityReady } from "./abilities";
import { animeTier, arcsOfAnime, canEnterNewAnime, isAnimeComplete, isArcUnlocked } from "./progression";
import { encounterPool, enemyHp, nextEnemy, pendingRecruits } from "./combat";
import type { ActiveModifier, Arc, Character, ComboDefinition, Enemy } from "./types";

function makeArc(id: string, animeId: string, order: number, mobs: Enemy[], mobsToBoss = 3): Arc {
  return {
    id,
    animeId,
    name: id,
    order,
    mobs,
    mobsToBoss,
    boss: { id: `${id}-boss`, name: "Boss", baseHp: 100, reward: 50, timerMs: 30_000 },
  };
}

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
      { id: "m1", sourceId: "s1", target: "teamDps", kind: "flat", value: 5 },
    ];
    expect(computeEffectiveStat(0, "clickPower", modifiers, 0)).toBe(0);
  });
});

describe("synergyMultiplier", () => {
  const arc = makeArc("arc-1", "anime-1", 0, []);
  const base = { name: "C", baseClickPower: 1, baseDps: 1 };

  it("gives the bonus when the character's arc matches", () => {
    const character: Character = { ...base, id: "c1", animeId: "anime-1", arcIds: ["arc-1"] };
    expect(synergyMultiplier(character, arc, defaultSynergyConfig)).toBe(defaultSynergyConfig.matchingArcMultiplier);
  });

  it("gives the same-anime malus when same anime but different arc", () => {
    const character: Character = { ...base, id: "c2", animeId: "anime-1", arcIds: ["arc-9"] };
    expect(synergyMultiplier(character, arc, defaultSynergyConfig)).toBe(defaultSynergyConfig.sameAnimeMalus);
  });

  it("gives the other-anime malus when from a different anime", () => {
    const character: Character = { ...base, id: "c3", animeId: "anime-2", arcIds: ["arc-x"] };
    expect(synergyMultiplier(character, arc, defaultSynergyConfig)).toBe(defaultSynergyConfig.otherAnimeMalus);
  });
});

describe("prestige", () => {
  it("computes no gain below the scale threshold", () => {
    expect(applyPrestige(createInitialPrestigeState(), 999).prestigePoints).toBe(0);
  });

  it("computes diminishing-returns gain above the scale threshold", () => {
    // sqrt(4_000_000 / 1_000_000) = 2
    expect(applyPrestige(createInitialPrestigeState(), 4_000_000).prestigePoints).toBe(2);
  });

  it("lets the player unlock any anime they can afford, in any order", () => {
    const state = { prestigePoints: 10, unlockedAnimeIds: [] as string[] };
    const after = unlockAnime(state, "anime-b", 5);
    expect(after.prestigePoints).toBe(5);
    expect(after.unlockedAnimeIds).toContain("anime-b");
  });

  it("refuses to unlock the same anime twice or without enough points", () => {
    const state = { prestigePoints: 1, unlockedAnimeIds: ["anime-a"] };
    expect(canUnlockAnime(state, "anime-a", 0)).toBe(false);
    expect(canUnlockAnime(state, "anime-b", 5)).toBe(false);
  });
});

describe("abilities", () => {
  const base = { animeId: "anime-1", arcIds: [], baseClickPower: 1, baseDps: 1 };
  const withAbility: Character = {
    ...base,
    id: "c1",
    name: "C1",
    ability: {
      id: "ability-1",
      name: "Ability 1",
      cooldownMs: 1000,
      durationMs: 500,
      effects: [{ id: "e1", target: "clickPower", kind: "multiplier", value: 2 }],
    },
  };
  const plain: Character = { ...base, id: "c2", name: "C2" };
  const combo: ComboDefinition = {
    id: "combo-1",
    name: "Combo 1",
    requiredCharacterIds: ["c1", "c2"],
    ability: {
      id: "ability-combo",
      name: "Combo ability",
      cooldownMs: 2000,
      durationMs: 1000,
      effects: [{ id: "e2", target: "teamDps", kind: "multiplier", value: 2 }],
    },
  };

  it("unlocks a solo ability when its character is owned", () => {
    const unlocked = getUnlockedAbilities(["c1"], [withAbility, plain], [combo]);
    expect(unlocked.map((u) => u.ability.id)).toEqual(["ability-1"]);
  });

  it("unlocks a combo ability only once every required character is owned", () => {
    expect(getUnlockedAbilities(["c1", "c2"], [withAbility, plain], [combo]).map((u) => u.ability.id)).toContain(
      "ability-combo"
    );
  });

  it("tracks cooldown readiness", () => {
    expect(isAbilityReady(undefined, 1000, 0)).toBe(true);
    expect(isAbilityReady(0, 1000, 500)).toBe(false);
    expect(isAbilityReady(0, 1000, 1000)).toBe(true);
  });
});

describe("world progression", () => {
  const arcs: Arc[] = [
    makeArc("a1", "a", 0, []),
    makeArc("a2", "a", 1, []),
    makeArc("b1", "b", 0, []),
  ];

  it("orders the arcs of an anime and keeps other animes out", () => {
    expect(arcsOfAnime(arcs, "a").map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("freezes an anime's difficulty at the tier it was entered", () => {
    expect(animeTier(["a", "b"], "a")).toBe(0);
    expect(animeTier(["a", "b"], "b")).toBe(1);
  });

  it("opens an arc only once the previous one of the same anime is cleared", () => {
    expect(isArcUnlocked(arcs, arcs[1], [])).toBe(false);
    expect(isArcUnlocked(arcs, arcs[1], ["a1"])).toBe(true);
    expect(isArcUnlocked(arcs, arcs[0], [])).toBe(true);
  });

  it("completes an anime only when every one of its arcs is cleared", () => {
    expect(isAnimeComplete(arcs, "a", ["a1"])).toBe(false);
    expect(isAnimeComplete(arcs, "a", ["a1", "a2"])).toBe(true);
  });

  it("lets the player pick a first world, then blocks travel until the current one is done", () => {
    expect(canEnterNewAnime([], arcs, [])).toBe(true);
    expect(canEnterNewAnime(["a"], arcs, ["a1"])).toBe(false);
    expect(canEnterNewAnime(["a"], arcs, ["a1", "a2"])).toBe(true);
  });
});

describe("combat", () => {
  const mob: Enemy = { id: "mob", name: "Mob", baseHp: 10, reward: 4 };
  const rival: Enemy = { id: "rival", name: "Rival", baseHp: 40, reward: 20, characterId: "c1" };
  const arc = makeArc("a1", "a", 0, [mob, rival], 3);

  it("scales hp with the world difficulty", () => {
    expect(enemyHp(mob, 1)).toBe(10);
    expect(enemyHp(mob, 2.5)).toBe(25);
  });

  it("stops offering a character encounter once they have joined", () => {
    expect(encounterPool(arc, []).map((e) => e.id)).toEqual(["mob", "rival"]);
    expect(encounterPool(arc, ["c1"]).map((e) => e.id)).toEqual(["mob"]);
    expect(pendingRecruits(arc, [])).toEqual(["c1"]);
    expect(pendingRecruits(arc, ["c1"])).toEqual([]);
  });

  it("sends the boss in once enough mobs are down", () => {
    expect(nextEnemy(arc, 0, [], false).id).toBe("mob");
    expect(nextEnemy(arc, 1, [], false).id).toBe("rival");
    expect(nextEnemy(arc, 3, [], false).id).toBe("a1-boss");
  });

  it("goes back to farming mobs once the arc is cleared", () => {
    expect(nextEnemy(arc, 3, [], true).id).not.toBe("a1-boss");
    expect(nextEnemy(arc, 99, ["c1"], true).id).toBe("mob");
  });
});
