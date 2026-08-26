import { describe, expect, it } from "vitest";
import { computeEffectiveStat, computeScopedStat, SCOPED_BUFF_CAP } from "../modifiers";
import { synergyMultiplier, defaultSynergyConfig } from "../synergy";
import { crossoverSynergyConfig, isMixedTeam } from "../crossover";
import type { ActiveModifier, Character } from "../types";
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
    // Four combos on the same character would be x10 * x10 * x10 * x10 = x10000 of their own damage.
    const modifiers = [flat("ca", 10), buff("c1", 10), buff("c2", 10), buff("c3", 10), buff("c4", 10)];
    expect(computeScopedStat(0, "teamDps", modifiers, 0)).toBeCloseTo(10 * SCOPED_BUFF_CAP);
    // Under the cap, the stack applies in full: x10 alone is worth exactly that.
    expect(computeScopedStat(0, "teamDps", [flat("ca", 10), buff("c1", 10)], 0)).toBeCloseTo(100);
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

  it("treats the evolution's anime as home once evolved, but not before", () => {
    const character: Character = {
      ...base,
      id: "c4",
      animeId: "anime-2",
      arcIds: ["arc-x"],
      evolution: { animeId: "anime-1", label: "Evolved", bonus: [] },
    };
    expect(synergyMultiplier(character, arc, defaultSynergyConfig, false)).toBe(defaultSynergyConfig.otherAnimeMalus);
    expect(synergyMultiplier(character, arc, defaultSynergyConfig, true)).toBe(defaultSynergyConfig.sameAnimeMalus);
  });
});
