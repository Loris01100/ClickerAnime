import { describe, expect, it } from "vitest";
import { getUnlockedAbilities, isAbilityReady } from "../abilities";
import type { Character, ComboDefinition } from "../types";

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
  const combo: ComboDefinition = {
    id: "combo-1",
    name: "Combo 1",
    requiredCharacterIds: ["c1", "c2"],
    ability: {
      id: "ability-combo",
      name: "Combo ability",
      cooldownMs: 2000,
      durationMs: 1000,
      effects: [{ target: "teamDps", kind: "multiplier", value: 2 }],
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
    expect(getUnlockedAbilities(["c3"], [evolvable], []).map((u) => u.ability.id)).toEqual(["ability-1"]);
    expect(getUnlockedAbilities(["c3"], [evolvable], [], ["c3"]).map((u) => u.ability.id)).toEqual([
      "ability-evolved",
    ]);
  });

  it("tracks cooldown readiness", () => {
    expect(isAbilityReady(undefined, 1000, 0)).toBe(true);
    expect(isAbilityReady(0, 1000, 500)).toBe(false);
    expect(isAbilityReady(0, 1000, 1000)).toBe(true);
  });
});
