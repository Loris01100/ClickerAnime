import { describe, expect, it } from "vitest";
import { computeEffectiveStat, computeScopedStat, scopedBuffCap, SCOPED_BUFF_CAP, SCOPED_BUFF_CAP_FLOOR } from "../modifiers";
import { characterContributions, synergyMultiplier, defaultSynergyConfig, isHomeArc } from "../synergy";
import { crossoverSynergyConfig, isMixedTeam } from "../crossover";
import type { ActiveModifier, Character, Item } from "../types";
import { makeArc } from "./helpers";

describe("computeEffectiveStat", () => {
  it("applies flat, then percent, then multiplier in order", () => {
    const modifiers: ActiveModifier[] = [
      { sourceId: "s1", target: "clickPower", kind: "flat", value: 5 },
      { sourceId: "s2", target: "clickPower", kind: "percent", value: 0.5 },
      { sourceId: "s3", target: "clickPower", kind: "multiplier", value: 2 },
    ];
    // (0 + 5) * (1 + 0.5) * 2 = 15
    expect(computeEffectiveStat(0, "clickPower", modifiers, 0)).toBe(15);
  });

  it("ignores expired modifiers", () => {
    const modifiers: ActiveModifier[] = [
      { sourceId: "s1", target: "clickPower", kind: "flat", value: 5, expiresAt: 100 },
    ];
    expect(computeEffectiveStat(0, "clickPower", modifiers, 200)).toBe(0);
    expect(computeEffectiveStat(0, "clickPower", modifiers, 50)).toBe(5);
  });

  it("ignores modifiers targeting a different stat", () => {
    const modifiers: ActiveModifier[] = [
      { sourceId: "s1", target: "teamDps", kind: "flat", value: 5 },
    ];
    expect(computeEffectiveStat(0, "clickPower", modifiers, 0)).toBe(0);
  });
});

describe("computeScopedStat", () => {
  const flat = (scope: string, value: number): ActiveModifier => ({
    sourceId: scope,
    scope,
    target: "teamDps",
    kind: "flat",
    value,
  });

  it("matches computeEffectiveStat while nothing is scoped to a single character", () => {
    const modifiers: ActiveModifier[] = [flat("ca", 10), flat("cb", 30), { sourceId: "p", target: "teamDps", kind: "percent", value: 0.5 }];
    expect(computeScopedStat(0, "teamDps", modifiers, 0)).toBeCloseTo(60); // (10 + 30) * 1.5
    expect(computeScopedStat(0, "teamDps", modifiers, 0)).toBeCloseTo(computeEffectiveStat(0, "teamDps", modifiers, 0));
  });

  it("applies a scoped buff to its own character only, and counts team-wide flats once", () => {
    const modifiers: ActiveModifier[] = [
      flat("ca", 10),
      flat("cb", 30),
      { sourceId: "tree", target: "teamDps", kind: "flat", value: 5 },
      { sourceId: "ability", scope: "ca", target: "teamDps", kind: "percent", value: 1 },
    ];
    // 5 team-wide + 10 * (1 + 1) + 30, the buff never touching cb
    expect(computeScopedStat(0, "teamDps", modifiers, 0)).toBeCloseTo(55);
  });

  it("caps what the buffs on one character can be worth, however many of them land", () => {
    const buff = (id: string, value: number): ActiveModifier => ({
      sourceId: id,
      scope: "ca",
      target: "teamDps",
      kind: "multiplier",
      value,
      expiresAt: 10_000,
    });
    // Four buffs on the same character would be x10 * x10 * x10 * x10 = x10000 of their own damage.
    const modifiers = [flat("ca", 10), buff("c1", 10), buff("c2", 10), buff("c3", 10), buff("c4", 10)];
    expect(computeScopedStat(0, "teamDps", modifiers, 0)).toBeCloseTo(10 * SCOPED_BUFF_CAP);
    // Under the cap, the stack applies in full: x10 alone is worth exactly that.
    expect(computeScopedStat(0, "teamDps", [flat("ca", 10), buff("c1", 10)], 0)).toBeCloseTo(100);
  });

  it("honours the ramped cap the store passes, not only the endgame one", () => {
    const buff = (id: string, value: number): ActiveModifier => ({
      sourceId: id,
      scope: "ca",
      target: "teamDps",
      kind: "multiplier",
      value,
      expiresAt: 10_000,
    });
    // x20 sits above the floor and under the ceiling, so it is the one buff the ramp actually moves.
    const modifiers = [flat("ca", 10), buff("c1", 20)];
    expect(computeScopedStat(0, "teamDps", modifiers, 0, scopedBuffCap(0))).toBeCloseTo(10 * SCOPED_BUFF_CAP_FLOOR);
    expect(computeScopedStat(0, "teamDps", modifiers, 0, scopedBuffCap(1))).toBeCloseTo(200);
  });
});

describe("scopedBuffCap", () => {
  it("runs from the floor to the full cap and never past either", () => {
    expect(scopedBuffCap(0)).toBeCloseTo(SCOPED_BUFF_CAP_FLOOR);
    expect(scopedBuffCap(1)).toBeCloseTo(SCOPED_BUFF_CAP);
    // The ceiling is what stops stacked multipliers on one character from running away, so
    // no progress value, and no bad one, may ever lift the cap past it.
    for (const progress of [-1, 0, 0.5, 1, 2, Number.NaN]) {
      const cap = scopedBuffCap(progress);
      expect(cap).toBeGreaterThanOrEqual(SCOPED_BUFF_CAP_FLOOR);
      expect(cap).toBeLessThanOrEqual(SCOPED_BUFF_CAP);
    }
  });

  it("climbs monotonically, so clearing an arc never weakens a buff", () => {
    for (let i = 1; i <= 20; i++) {
      expect(scopedBuffCap(i / 20)).toBeGreaterThan(scopedBuffCap((i - 1) / 20));
    }
  });

  it("keeps the floor meaningfully under the cap — at equality the whole ramp is dead", () => {
    expect(SCOPED_BUFF_CAP_FLOOR).toBeLessThan(SCOPED_BUFF_CAP / 2);
  });
});

describe("crossover", () => {
  const arc = makeArc("arc-1", "anime-1", 0, []);
  const base = { name: "C", baseClickPower: 1, baseDps: 1, rarity: "secondary" as const };
  const home: Character = { ...base, id: "c1", animeId: "anime-1", arcIds: ["arc-1"] };
  const foreign: Character = { ...base, id: "c2", animeId: "anime-2", arcIds: ["arc-x"] };

  it("only counts a team spanning two worlds as mixed", () => {
    expect(isMixedTeam([home])).toBe(false);
    expect(isMixedTeam([home, { ...home, id: "c1b" }])).toBe(false);
    expect(isMixedTeam([home, foreign])).toBe(true);
  });

  it("lifts every synergy malus while active", () => {
    const config = crossoverSynergyConfig(defaultSynergyConfig);
    expect(synergyMultiplier(foreign, arc, config)).toBe(config.matchingArcMultiplier);
    expect(synergyMultiplier({ ...home, arcIds: ["arc-9"] }, arc, config)).toBe(config.matchingArcMultiplier);
  });
});

describe("synergyMultiplier", () => {
  const arc = makeArc("arc-1", "anime-1", 0, []);
  const base = { name: "C", baseClickPower: 1, baseDps: 1, rarity: "secondary" as const };

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

  it("treats a later appearance as home without granting full arc synergy", () => {
    const character: Character = {
      ...base,
      id: "c-appears",
      animeId: "anime-2",
      arcIds: ["arc-x"],
      appearanceAnimeIds: ["anime-1"],
    };
    expect(synergyMultiplier(character, arc, defaultSynergyConfig)).toBe(defaultSynergyConfig.sameAnimeMalus);
    expect(isHomeArc(character, arc)).toBe(true);
  });

  it("grants full synergy when the character spans the whole later anime", () => {
    const character: Character = {
      ...base,
      id: "c-recurring-lead",
      animeId: "anime-2",
      arcIds: ["arc-x"],
      fullSynergyAnimeIds: ["anime-1"],
    };
    expect(synergyMultiplier(character, arc, defaultSynergyConfig)).toBe(defaultSynergyConfig.matchingArcMultiplier);
    expect(isHomeArc(character, arc)).toBe(true);
  });

  it("treats the evolution's anime as home once evolved, but not before", () => {
    const character: Character = {
      ...base,
      id: "c4",
      animeId: "anime-2",
      arcIds: ["arc-x"],
      evolutions: [{ animeId: "anime-1", label: "Evolved", bonus: [] }],
    };
    expect(synergyMultiplier(character, arc, defaultSynergyConfig, false)).toBe(defaultSynergyConfig.otherAnimeMalus);
    expect(synergyMultiplier(character, arc, defaultSynergyConfig, true)).toBe(defaultSynergyConfig.sameAnimeMalus);
  });
});

/**
 * A `multiplier` is neutral at 1, so weakening one means shrinking the part *above* 1 — not scaling
 * the value. Scaling it directly turned every multiplier effect into a malus at the other-anime
 * tier: a x1.35 unique came out x0.675, i.e. the character dealt a third less damage *because* they
 * were wearing it. Guarded on all three carriers, since `ModifierTemplate` allows a multiplier on
 * each even where today's data only uses percents.
 */
describe("synergy never inverts a multiplier", () => {
  const arc = makeArc("arc-1", "anime-1", 0, []);
  const base = { name: "C", baseClickPower: 1, baseDps: 10, rarity: "secondary" as const };
  const abroad: Character = { ...base, id: "c-abroad", animeId: "anime-2", arcIds: ["arc-x"] };
  const dpsOf = (mods: ActiveModifier[]) => computeScopedStat(0, "teamDps", mods, 0);

  it("keeps an equipped unique a gain, however far from home", () => {
    const unique: Item = {
      id: "i-mult",
      kind: "unique",
      name: "Multiplier",
      effects: [{ target: "teamDps", kind: "multiplier", value: 1.35 }],
    };
    const bare = dpsOf(characterContributions(abroad, arc, defaultSynergyConfig, 0, 0, false, []));
    const worn = dpsOf(characterContributions(abroad, arc, defaultSynergyConfig, 0, 0, false, [unique]));
    // 1 + 0.35 * 0.5 = x1.175 — weakened by the malus, never below the bare character.
    expect(worn / bare).toBeCloseTo(1.175, 10);
    expect(worn).toBeGreaterThan(bare);
  });

  it("keeps a multiplier passive a gain", () => {
    const withPassive: Character = {
      ...abroad,
      // A passive shuts off entirely abroad, so this one is tested at the same-anime tier.
      animeId: "anime-1",
      arcIds: ["arc-9"],
      passive: { target: "teamDps", kind: "multiplier", value: 2 },
    };
    const naked: Character = { ...withPassive, passive: undefined };
    const ranked = dpsOf(characterContributions(withPassive, arc, defaultSynergyConfig, 0, 1));
    const unranked = dpsOf(characterContributions(naked, arc, defaultSynergyConfig, 0, 1));
    // 1 + 1 * 0.85 = x1.85 at the same-anime malus, rank 1 being the passive as printed.
    expect(ranked / unranked).toBeCloseTo(1.85, 10);
    expect(ranked).toBeGreaterThan(unranked);
  });

  it("keeps a multiplier evolution bonus a gain", () => {
    const evolving: Character = {
      ...base,
      id: "c-evo",
      animeId: "anime-2",
      arcIds: ["arc-x"],
      evolutions: [{
        animeId: "anime-9",
        label: "Evolved",
        bonus: [{ target: "teamDps", kind: "multiplier", value: 3 }],
      }],
    };
    const mods = characterContributions(evolving, arc, defaultSynergyConfig, 0, 0, true);
    const bonus = mods.find((m) => m.kind === "multiplier")!;
    // 1 + 2 * 0.5 = x2, not x1.5 and never below 1.
    expect(bonus.value).toBeCloseTo(2, 10);
    expect(bonus.value).toBeGreaterThan(1);
  });

  it("stacks every reached evolution bonus", () => {
    const evolving: Character = {
      ...base,
      id: "c-multi-evo",
      animeId: "anime-2",
      arcIds: ["arc-x"],
      evolutions: [
        { animeId: "anime-1", label: "Stage 1", bonus: [{ target: "teamDps", kind: "percent", value: 0.2 }] },
        { animeId: "anime-0", label: "Stage 2", bonus: [{ target: "teamDps", kind: "percent", value: 0.3 }] },
      ],
    };
    const first = characterContributions(evolving, arc, defaultSynergyConfig, 0, 0, 1);
    const second = characterContributions(evolving, arc, defaultSynergyConfig, 0, 0, 2);
    expect(first.filter((modifier) => modifier.kind === "percent")).toHaveLength(1);
    expect(second.filter((modifier) => modifier.kind === "percent")).toHaveLength(2);
  });
});
