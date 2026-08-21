import { describe, expect, it } from "vitest";
import { SPRITE_HEIGHT, SPRITE_WIDTH, spriteCells, spriteHue } from "./pixel";
import { describeAbility, describeModifier } from "./describe";

describe("pixel sprites", () => {
  it("gives the same sprite for the same id, every time", () => {
    expect(spriteCells("char-a1")).toEqual(spriteCells("char-a1"));
    expect(spriteHue("char-a1")).toBe(spriteHue("char-a1"));
  });

  it("gives different sprites to different ids", () => {
    expect(spriteCells("char-a1")).not.toEqual(spriteCells("char-a2"));
  });

  it("mirrors each row so the result reads as a creature", () => {
    for (const row of spriteCells("boss-1")) {
      expect(row).toHaveLength(SPRITE_WIDTH);
      expect(row).toEqual([...row].reverse());
    }
    expect(spriteCells("boss-1")).toHaveLength(SPRITE_HEIGHT);
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
