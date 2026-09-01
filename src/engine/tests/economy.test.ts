import { describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore } from "../gameState";
import { ACHIEVEMENT_CATEGORIES, achievementContributions, achievementNextThreshold, achievementTierBonus, achievementTiersCompleted } from "../achievements";
import { characterContributions, defaultSynergyConfig } from "../synergy";
import { rollsDrop } from "../combat";
import { canBuyShopOffer, shopOfferUnlocked } from "../shop";
import { drawPack, duplicateGrowth, MAX_DUPLICATES, packPool, PACK_COST } from "../packs";
import type { ActiveModifier, Arc, Character, Enemy, Item, ShopOffer } from "../types";
import { canEquipOn, itemAnimeIndex, sanitizedEquipment } from "../forge";
import { baseSave, installSave, makeArc } from "./helpers";

describe("items", () => {
  it("drops guaranteed without a dropChance, and by the odds with one", () => {
    const boss: Enemy = { id: "b", name: "B", baseHp: 1, reward: 1, itemId: "u1" };
    const mob: Enemy = { id: "m", name: "M", baseHp: 1, reward: 1, itemId: "c1", dropChance: 0.1 };
    const barren: Enemy = { id: "x", name: "X", baseHp: 1, reward: 1 };
    expect(rollsDrop(boss, 0.99)).toBe(true);
    expect(rollsDrop(mob, 0.05)).toBe(true);
    expect(rollsDrop(mob, 0.5)).toBe(false);
    expect(rollsDrop(barren, 0)).toBe(false);
  });
});

describe("shop", () => {
  it("shopOfferUnlocked: true without a condition, or once the required anime is cleared", () => {
    const free: ShopOffer = { id: "o1", kind: "item", targetId: "i1", cost: 10 };
    const gated: ShopOffer = { id: "o2", kind: "item", targetId: "i1", cost: 10, requiresAnimeId: "a1" };
    expect(shopOfferUnlocked(free, [])).toBe(true);
    expect(shopOfferUnlocked(gated, [])).toBe(false);
    expect(shopOfferUnlocked(gated, ["a1"])).toBe(true);
  });

  it("canBuyShopOffer: locked, unaffordable, and already-owned character all block the purchase", () => {
    const item: ShopOffer = { id: "o1", kind: "item", targetId: "i1", cost: 10 };
    const gatedChar: ShopOffer = { id: "o2", kind: "character", targetId: "c1", cost: 10, requiresAnimeId: "a1" };
    expect(canBuyShopOffer(item, 10, [], [])).toBe(true);
    expect(canBuyShopOffer(item, 9, [], [])).toBe(false);
    expect(canBuyShopOffer(gatedChar, 10, [], [])).toBe(false);
    expect(canBuyShopOffer(gatedChar, 10, ["a1"], [])).toBe(true);
    expect(canBuyShopOffer(gatedChar, 10, ["a1"], ["c1"])).toBe(false);
    // item offers stay buyable even if targetId happens to match an "owned" id — ownership only gates characters
    expect(canBuyShopOffer(item, 10, [], ["i1"])).toBe(true);
  });
});

describe("achievements", () => {
  it("has strictly increasing tiers in every category", () => {
    for (const category of ACHIEVEMENT_CATEGORIES) {
      for (let i = 1; i < category.tiers.length; i++) {
        expect(category.tiers[i]).toBeGreaterThan(category.tiers[i - 1]);
      }
    }
  });

  it("has unique ids and spreads its bonuses over both targets", () => {
    const ids = ACHIEVEMENT_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The click is a trigger, not a damage source: it must not carry every ladder in the game.
    const clickLadders = ACHIEVEMENT_CATEGORIES.filter((c) => c.target === "clickPower");
    expect(clickLadders.length).toBeGreaterThan(0);
    expect(clickLadders.length).toBeLessThan(ACHIEVEMENT_CATEGORIES.length / 2);
  });

  it("counts completed tiers at, but not before, their threshold", () => {
    const category = ACHIEVEMENT_CATEGORIES[0];
    const [first, second] = category.tiers;
    expect(achievementTiersCompleted(category, first - 1)).toBe(0);
    expect(achievementTiersCompleted(category, first)).toBe(1);
    expect(achievementTiersCompleted(category, second)).toBe(2);
  });

  it("reports the next threshold, and null once every tier is done", () => {
    const category = ACHIEVEMENT_CATEGORIES[0];
    expect(achievementNextThreshold(category, 0)).toBe(category.tiers[0]);
    const maxed = category.tiers[category.tiers.length - 1];
    expect(achievementNextThreshold(category, maxed)).toBe(null);
  });

  it("grows the bonus with the tier, and only emits modifiers for completed tiers", () => {
    expect(achievementTierBonus(1)).toBeGreaterThan(achievementTierBonus(0));

    const category = ACHIEVEMENT_CATEGORIES[0];
    const oneTierIn = achievementContributions({ [category.id]: category.tiers[0] });
    expect(oneTierIn).toHaveLength(1);
    expect(oneTierIn[0]).toMatchObject({ target: category.target, kind: "percent" });

    expect(achievementContributions({})).toHaveLength(0);
  });
});

describe("packs", () => {
  const cast: Character[] = [
    { id: "m1", name: "M1", animeId: "ta", rarity: "main", arcIds: [], baseClickPower: 10, baseDps: 10 },
    { id: "m2", name: "M2", animeId: "ta", rarity: "main", arcIds: [], baseClickPower: 10, baseDps: 10 },
    { id: "s1", name: "S1", animeId: "ta", rarity: "secondary", arcIds: [], baseClickPower: 10, baseDps: 10 },
    { id: "o1", name: "O1", animeId: "tb", rarity: "main", arcIds: [], baseClickPower: 10, baseDps: 10 },
  ];

  it("packPool keeps only recruited characters from one world and rarity", () => {
    const recruited = ["m1", "s1", "o1"];
    expect(packPool(cast, "ta", "main", recruited).map((c) => c.id)).toEqual(["m1"]);
    expect(packPool(cast, "ta", "secondary", recruited).map((c) => c.id)).toEqual(["s1"]);
    expect(packPool(cast, "ta", "main", [])).toEqual([]);
    const pool = packPool(cast, "ta", "main", ["m1", "m2"]);
    expect(drawPack(pool, 0)?.id).toBe("m1");
    expect(drawPack(pool, 0.99)?.id).toBe("m2");
    // A roll of exactly 1 must not fall off the end of the pool.
    expect(drawPack(pool, 1)?.id).toBe("m2");
    expect(drawPack([], 0.5)).toBeNull();
  });

  it("packPool drops a character already held at MAX_DUPLICATES, and empties when all are", () => {
    const recruited = ["m1", "m2"];
    const capped = (id: string) => (id === "m1" ? MAX_DUPLICATES : 0);
    expect(packPool(cast, "ta", "main", recruited, capped).map((c) => c.id)).toEqual(["m2"]);
    // One under the cap is still on offer; the cap is a ceiling, not a threshold.
    expect(packPool(cast, "ta", "main", recruited, () => MAX_DUPLICATES - 1)).toHaveLength(2);
    expect(packPool(cast, "ta", "main", recruited, () => MAX_DUPLICATES)).toEqual([]);
  });

  it("duplicates multiply a character's base damage, on top of levels", () => {
    const arc: Arc = {
      id: "ta-arc",
      animeId: "ta",
      name: "Arc",
      order: 0,
      mobs: [],
      mobsToBoss: 1,
      boss: { id: "b", name: "B", baseHp: 1, reward: 1 },
    };
    const none = characterContributions(cast[0], arc, defaultSynergyConfig, 0, 0, false, [], 0);
    const two = characterContributions(cast[0], arc, defaultSynergyConfig, 0, 0, false, [], 2);
    const clickOf = (mods: ActiveModifier[]) => mods.find((m) => m.target === "clickPower")!.value;
    expect(clickOf(two)).toBeCloseTo(clickOf(none) * duplicateGrowth(2));
  });

  it("earns a point per fight won in that world, buys a duplicate, and survives a prestige", () => {
    const testData = {
      animes: [{ id: "ta", name: "TA", unlockCost: 0 }],
      arcs: [
        {
          id: "ta-arc",
          animeId: "ta",
          name: "Arc",
          order: 0,
          mobsToBoss: 100_000,
          mobs: [
            { id: "ta-recruit", name: "S1", baseHp: 1, reward: 1, characterId: "s1" },
            { id: "ta-mob", name: "Mob", baseHp: 1, reward: 1 },
          ],
          boss: { id: "ta-boss", name: "Boss", baseHp: 1_000_000, reward: 1 },
        },
      ],
      characters: [cast[2]],
      items: [],
    };

    // `dealDamage` spends the kill budget strictly, so 250 fights cost real time however hard the
    // click hits: the tick has to run for the budget to refill at MAX_KILLS_PER_SECOND. Clicking in
    // a tight loop on a frozen clock used to fell one mob per click regardless — which is exactly
    // the leak the budget is there to close.
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      game.travelTo("ta");

      expect(game.openPack("ta", "secondary")).toBeNull(); // no points yet
      expect(game.packPoolOf("ta", "secondary")).toEqual([]); // s1 is still ahead in the story
      // Clicking until the pack is affordable rather than a fixed count: one click can fell several
      // 1-hp mobs once an achievement tier has lifted the click's damage (overkill carries over).
      while (game.worldPointsOf("ta") < PACK_COST.secondary) {
        game.click();
        vi.advanceTimersByTime(200);
      }
      expect(game.ownedCharacterIds()).toContain("s1");
      const banked = game.worldPointsOf("ta");
      expect(banked).toBeGreaterThanOrEqual(PACK_COST.secondary);
      // No main-rarity character in this world: that pack can't be drawn at all.
      expect(game.packPoolOf("ta", "main")).toEqual([]);

      expect(game.openPack("ta", "secondary")?.id).toBe("s1");
      expect(game.worldPointsOf("ta")).toBe(banked - PACK_COST.secondary);
      expect(game.duplicatesOf("s1")).toBe(1);

      // Meta-progression: the run resets, the copies (and any leftover points) do not.
      game.prestigeReset();
      expect(game.duplicatesOf("s1")).toBe(1);
    } finally {
      disposeRoot();
      vi.useRealTimers();
    }
  });
});

describe("le succès « objets uniques équipés »", () => {
  const data = {
    animes: [{ id: "ta", name: "A", unlockCost: 0 }],
    arcs: [
      {
        id: "ta-arc",
        animeId: "ta",
        name: "Arc",
        order: 0,
        mobsToBoss: 3,
        mobs: [{ id: "m", name: "M", baseHp: 10, reward: 1 }],
        boss: { id: "b", name: "B", baseHp: 50, reward: 5 },
      },
    ],
    characters: [
      {
        id: "ca",
        name: "A",
        animeId: "ta",
        rarity: "main" as const,
        arcIds: ["ta-arc"],
        baseClickPower: 1,
        baseDps: 1,
      },
    ],
    items: [
      { id: "u1", name: "U1", kind: "unique" as const, effects: [] },
      {
        id: "u2",
        name: "U2",
        kind: "unique" as const,
        effects: [{ target: "teamDps" as const, kind: "multiplier" as const, value: 2 }],
      },
    ],
  };

  it("l'objet unique équipé compte dans le DPS affiché du personnage", () => {
    const restore = installSave(baseSave({ itemCounts: { u2: 1 } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      const character = data.characters[0];
      const before = game.characterStatOf(character, "teamDps");
      expect(game.equipItem("ca", "u2")).toBe(true);
      // x2 from the unique, and the first "objets uniques équipés" tier the equip itself completes:
      // the displayed stat is the character's term in `teamDps`, so every team-wide bonus is in it.
      expect(game.characterStatOf(character, "teamDps")).toBeCloseTo(before * 2 * (1 + achievementTierBonus(0)));
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("ne compte pas deux fois le même objet qu'on déséquipe et rééquipe", () => {
    const restore = installSave(baseSave({ itemCounts: { u1: 1 } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });

      expect(game.equipItem("ca", "u1")).toBe(true);
      expect(game.achievementCounts().uniquesEquipped).toBe(1);

      // Le va-et-vient sur le même objet : `unequipItem` vide la table, donc sans garde le
      // rééquipement recompte. Quelques centaines d'allers-retours d'un seul `<select>` suffisaient
      // à monter toute l'échelle — un bonus de teamDps permanent qui survit même au prestige.
      for (let i = 0; i < 20; i++) {
        game.unequipItem("ca");
        game.equipItem("ca", "u1");
      }
      expect(game.achievementCounts().uniquesEquipped).toBe(1);
    } finally {
      disposeRoot();
      restore();
    }
  });
});

describe("équipement : un accessoire ne quitte pas son monde", () => {
  const unique: Item = {
    id: "u-ta",
    kind: "unique",
    name: "Relique de TA",
    effects: [{ target: "teamDps", kind: "multiplier", value: 1.5 }],
  };
  const arcs: Arc[] = [
    { ...makeArc("ta-arc", "ta", 0, [{ id: "m", name: "M", baseHp: 1, reward: 1, itemId: "c-ta" }]) },
    { ...makeArc("tb-arc", "tb", 0, []) },
  ];
  arcs[0].boss.itemId = unique.id;

  const local: Character = { id: "local", name: "L", animeId: "ta", rarity: "main", arcIds: [], baseClickPower: 1, baseDps: 1 };
  const visitor: Character = { ...local, id: "visitor", animeId: "tb", appearanceAnimeIds: ["ta"] };
  const heir: Character = {
    ...local,
    id: "heir",
    animeId: "tb",
    evolution: { animeId: "ta", label: "L2", bonus: [{ target: "teamDps", kind: "percent", value: 0.1 }] },
  };
  const foreigner: Character = { ...local, id: "foreigner", animeId: "tb" };

  it("itemAnimeIndex reads an item's world off the enemy that drops it", () => {
    expect(itemAnimeIndex(arcs)).toEqual({ "u-ta": "ta", "c-ta": "ta" });
  });

  it("n'autorise que les personnages qui sont chez eux dans ce monde", () => {
    const world = itemAnimeIndex(arcs)[unique.id];
    expect(canEquipOn(local, unique, world)).toBe(true);
    // Une apparition ou une évolution dans ce monde suffit : la même règle que les capacités.
    expect(canEquipOn(visitor, unique, world)).toBe(true);
    expect(canEquipOn(heir, unique, world)).toBe(true);
    expect(canEquipOn(foreigner, unique, world)).toBe(false);
    // Un objet que personne ne lâche n'a pas de monde : il ne s'interdit à personne.
    expect(canEquipOn(foreigner, unique, undefined)).toBe(true);
    // `equippableBy` continue de restreindre par-dessus.
    expect(canEquipOn(local, { ...unique, equippableBy: { tags: ["sage"] } }, world)).toBe(false);
  });

  it("nettoie un équipement sauvegardé devenu étranger à son monde", () => {
    const characters = [local, foreigner];
    const items = [unique];
    const counts = { [unique.id]: 1 };
    expect(sanitizedEquipment(characters, items, arcs, { local: unique.id }, counts, ["local", "foreigner"])).toEqual({
      local: unique.id,
    });
    expect(sanitizedEquipment(characters, items, arcs, { foreigner: unique.id }, counts, ["local", "foreigner"])).toEqual({});
  });
});
