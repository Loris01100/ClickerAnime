import { describe, expect, it } from "vitest";
import { spriteHue, themeOf } from "./hue";
import { describeAbility, describeCharacterTag, describeModifier } from "./describe";
import { imagePathsForAnime } from "./preload";

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
    expect(describeModifier({ target: "clickPower", kind: "flat", value: 5 })).toBe("+5 au clic");
    expect(describeModifier({ target: "clickPower", kind: "percent", value: 0.1 })).toBe("+10 % au clic");
    expect(describeModifier({ target: "teamDps", kind: "multiplier", value: 2 })).toBe("x2 de DPS");
  });

  it("lists every effect of an ability with its timings", () => {
    const text = describeAbility({
      id: "a",
      name: "A",
      cooldownMs: 30_000,
      durationMs: 5_000,
      effects: [{ target: "clickPower", kind: "multiplier", value: 3 }],
    });
    expect(text).toContain("x3 au clic");
    expect(text).toContain("5.0s");
    // La recharge affichée est celle réellement appliquée : 30s x ABILITY_COOLDOWN_SCALE.
    expect(text).toContain("45s");
  });
});

describe("describeCharacterTag", () => {
  it("translates equipment categories and keeps unknown ones readable", () => {
    expect(describeCharacterTag("swordsman")).toBe("Épéiste");
    expect(describeCharacterTag("future-tag")).toBe("future-tag");
  });
});

describe("imagePathsForAnime", () => {
  it("warms only the selected world's map and item art", () => {
    const data = {
      animes: [
        { id: "a", name: "A", unlockCost: 1, mapImage: "/a.jpg" },
        { id: "b", name: "B", unlockCost: 1, mapImage: "/b.jpg" },
      ],
      arcs: [
        { id: "arc-a", animeId: "a", name: "A", order: 0, mobsToBoss: 1, mobs: [{ id: "mob", name: "Mob", baseHp: 1, reward: 1, itemId: "item-shuriken" }], boss: { id: "boss", name: "Boss", baseHp: 1, reward: 1 } },
        { id: "arc-b", animeId: "b", name: "B", order: 0, mobsToBoss: 1, mobs: [{ id: "mob-b", name: "Mob", baseHp: 1, reward: 1, itemId: "item-ration" }], boss: { id: "boss-b", name: "Boss", baseHp: 1, reward: 1 } },
      ],
      items: [
        { id: "item-shuriken", name: "Shuriken", kind: "common" as const },
        { id: "item-ration", name: "Ration", kind: "common" as const },
      ],
      characters: [],
      combos: [],
    };

    expect(imagePathsForAnime(data, "a")).toEqual(["/a.jpg", "/items/item-shuriken.png"]);
  });
});
