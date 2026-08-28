import { describe, expect, it } from "vitest";
import { autoFirable, getUnlockedAbilities, isAbilityReady } from "../abilities";
import type { AbilityPolicy, UnlockedAbility } from "../abilities";
import type { Arc, Character } from "../types";

describe("abilities", () => {
  const base = { animeId: "anime-1", arcIds: [], baseClickPower: 1, baseDps: 1, rarity: "main" as const };
  const withAbility: Character = {
    ...base,
    id: "c1",
    name: "C1",
    ability: {
      id: "ability-1",
      name: "Ability 1",
      cooldownMs: 1000,
      durationMs: 500,
      effects: [{ target: "clickPower", kind: "multiplier", value: 2 }],
    },
  };
  const plain: Character = { ...base, id: "c2", name: "C2" };

  it("unlocks a solo ability when its character is owned", () => {
    const unlocked = getUnlockedAbilities(["c1"], [withAbility, plain]);
    expect(unlocked.map((u) => u.ability.id)).toEqual(["ability-1"]);
  });

  it("scopes an ability to the character it comes from", () => {
    expect(getUnlockedAbilities(["c1", "c2"], [withAbility, plain])).toEqual([
      { ability: withAbility.ability, sourceId: "c1", characterIds: ["c1"] },
    ]);
  });

  const arcIn = (animeId: string): Arc => ({
    id: `${animeId}-arc`,
    animeId,
    name: "Arc",
    order: 0,
    mobsToBoss: 1,
    mobs: [{ id: "mob", name: "Mob", baseHp: 1, reward: 1 }],
    boss: { id: "boss", name: "Boss", baseHp: 1, reward: 1 },
  });

  it("laisse la capacité au personnage dans son propre monde", () => {
    expect(getUnlockedAbilities(["c1"], [withAbility], [], arcIn("anime-1")).map((u) => u.ability.id)).toEqual([
      "ability-1",
    ]);
  });

  it("retire la capacité d'un personnage hors de son monde", () => {
    expect(getUnlockedAbilities(["c1"], [withAbility], [], arcIn("anime-2"))).toEqual([]);
  });

  it("rend la capacité dans le monde de son évolution, une fois évolué", () => {
    const evolvable: Character = {
      ...base,
      id: "c4",
      name: "C4",
      ability: withAbility.ability,
      evolution: { animeId: "anime-2", label: "Evolved", bonus: [] },
    };
    // Pas encore évolué : anime-2 reste l'étranger, comme pour le malus de synergie.
    expect(getUnlockedAbilities(["c4"], [evolvable], [], arcIn("anime-2"))).toEqual([]);
    expect(getUnlockedAbilities(["c4"], [evolvable], ["c4"], arcIn("anime-2")).map((u) => u.ability.id)).toEqual([
      "ability-1",
    ]);
  });

  it("swaps a character's ability for their evolution's once evolved", () => {
    const evolvable: Character = {
      ...base,
      id: "c3",
      name: "C3",
      ability: withAbility.ability,
      evolution: {
        animeId: "anime-2",
        label: "Evolved",
        bonus: [],
        ability: {
          id: "ability-evolved",
          name: "Evolved ability",
          cooldownMs: 1000,
          durationMs: 500,
          effects: [{ target: "teamDps", kind: "multiplier", value: 3 }],
        },
      },
    };
    expect(getUnlockedAbilities(["c3"], [evolvable]).map((u) => u.ability.id)).toEqual(["ability-1"]);
    expect(getUnlockedAbilities(["c3"], [evolvable], ["c3"]).map((u) => u.ability.id)).toEqual(["ability-evolved"]);
  });

  it("tracks cooldown readiness", () => {
    expect(isAbilityReady(undefined, 1000, 0)).toBe(true);
    expect(isAbilityReady(0, 1000, 500)).toBe(false);
    expect(isAbilityReady(0, 1000, 1000)).toBe(true);
  });

  it("plans which abilities the automation may fire", () => {
    const u = (id: string): UnlockedAbility => ({
      ability: { id, name: id, cooldownMs: 1, durationMs: 1, effects: [] },
      sourceId: id,
      characterIds: [],
    });
    const all = [u("a"), u("b"), u("c")];
    const policies: Record<string, AbilityPolicy> = { a: "boss", b: "sync", c: "sync" };
    const policyOf = (id: string) => policies[id] ?? "always";
    const ids = (list: UnlockedAbility[]) => list.map((x) => x.ability.id);

    // "boss" waits for the boss; the sync group waits for its last member.
    expect(ids(autoFirable([all[0], all[1]], all, policyOf, false))).toEqual([]);
    expect(ids(autoFirable([all[0], all[1]], all, policyOf, true))).toEqual(["a"]);
    expect(ids(autoFirable(all, all, policyOf, true))).toEqual(["a", "b", "c"]);
    // No policy set anywhere: everything ready fires, as before.
    expect(ids(autoFirable(all, all, () => "always", false))).toEqual(["a", "b", "c"]);
  });
});
