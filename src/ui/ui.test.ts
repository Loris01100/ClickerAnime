import { describe, expect, it } from "vitest";
import { spriteHue, themeOf } from "./hue";
import { describeAbility, describeModifier } from "./describe";

describe("spriteHue", () => {
  it("gives the same hue for the same id, every time", () => {
    expect(spriteHue("char-a1")).toBe(spriteHue("char-a1"));
  });

  it("gives different hues to different ids", () => {
    expect(spriteHue("char-a1")).not.toBe(spriteHue("char-a2"));
  });
});

describe("themeOf", () => {
  it("falls back to the hash when a world has no hand-picked hue", () => {
    const anime = { id: "w1", name: "W1", unlockCost: 1 };
    expect(themeOf(anime)).toBe(spriteHue("w1"));
  });

  it("prefers a hand-picked hue over the hash", () => {
    const anime = { id: "w1", name: "W1", unlockCost: 1, themeHue: 28 };
    expect(themeOf(anime)).toBe(28);
  });
});

describe("describeModifier", () => {
  it("words each kind of modifier for its target", () => {
    expect(describeModifier({ id: "m", target: "clickPower", kind: "flat", value: 5 })).toBe("+5 au clic");
    expect(describeModifier({ id: "m", target: "clickPower", kind: "percent", value: 0.1 })).toBe("+10 % au clic");
    expect(describeModifier({ id: "m", target: "teamDps", kind: "multiplier", value: 2 })).toBe("x2 de DPS");
  });

  it("lists every effect of an ability with its timings", () => {
    const text = describeAbility({
      id: "a",
      name: "A",
      cooldownMs: 30_000,
      durationMs: 5_000,
      effects: [{ id: "e", target: "clickPower", kind: "multiplier", value: 3 }],
    });
    expect(text).toContain("x3 au clic");
    expect(text).toContain("5.0s");
    expect(text).toContain("30s");
  });
});
