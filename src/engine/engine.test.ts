import { describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore } from "./gameState";
import { gameData } from "../data";
import {
  ACHIEVEMENT_CATEGORIES,
  achievementContributions,
  achievementNextThreshold,
  achievementTierBonus,
  achievementTiersCompleted,
} from "./achievements";
import { computeEffectiveStat, replaceModifiersByTarget } from "./modifiers";
import { characterContributions, synergyMultiplier, defaultSynergyConfig } from "./synergy";
import { crossoverSynergyConfig, isMixedTeam } from "./crossover";
import { applyPrestige, canUnlockAnime, createInitialPrestigeState, unlockAnime } from "./prestige";
import { abilitiesShareType, getUnlockedAbilities, isAbilityReady } from "./abilities";
import {
  animeTier,
  arcsOfAnime,
  canEnterNewAnime,
  isAnimeAvailable,
  isAnimeComplete,
  isArcUnlocked,
} from "./progression";
import { encounterPool, enemyHp, nextEnemy, pendingRecruits, rollsDrop } from "./combat";
import { canBuyShopOffer, shopOfferUnlocked } from "./shop";
import { drawPack, duplicateGrowth, packPool, PACK_COST } from "./packs";
import {
  isPassiveMaxed,
  LEVEL_DAMAGE_STEP,
  levelFromXp,
  levelGrowth,
  narratorClickPower,
  PASSIVE_LEVEL_CAP,
  passiveRankCost,
  passiveUpgrade,
  XP_PER_KILL_REWARD,
  xpProgress,
  xpToReach,
} from "./growth";
import type { ActiveModifier, Anime, Arc, Character, ComboDefinition, Enemy, ShopOffer } from "./types";
import { layoutArcs, MAP_COLS } from "./mapLayout";
import {
  AUTOCLICK_INTERVAL_MS,
  AUTOCLICK_POWER_FRACTION,
  canPurchaseNodeLevel,
  CURRENCY_GAIN_PERCENT,
  isNodeUnlocked,
  LEVEL_COSTS,
  LEVELS_PER_BRANCH,
  LEVELS_PER_NODE,
  nodeCost,
  nodeLevel,
  nodeLevels,
  NARRATOR_CLICK_PERCENT,
  prestigeTreeContributions,
  PRESTIGE_TREE_CATEGORIES,
  purchaseNodeLevel,
  SHOP_COST_DISCOUNT,
  softenedSynergyConfig,
  TEAM_DPS_PERCENT,
  totalLevels,
  XP_GAIN_PERCENT,
} from "./prestigeTree";

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

describe("replaceModifiersByTarget", () => {
  it("cuts short whatever else was boosting the same stat instead of stacking with it", () => {
    const existing: ActiveModifier[] = [
      { sourceId: "ability-a", target: "teamDps", kind: "multiplier", value: 2, expiresAt: 9_000 },
      { sourceId: "ability-a", target: "clickPower", kind: "percent", value: 0.5, expiresAt: 9_000 },
    ];
    const incoming: ActiveModifier[] = [
      { sourceId: "ability-b", target: "teamDps", kind: "multiplier", value: 3, expiresAt: 20_000 },
    ];
    const result = replaceModifiersByTarget(existing, incoming);
    // the old teamDps buff is gone, the unrelated clickPower one survives, the new one is in
    expect(result.find((m) => m.sourceId === "ability-a" && m.target === "teamDps")).toBeUndefined();
    expect(result.find((m) => m.sourceId === "ability-a" && m.target === "clickPower")).toBeDefined();
    expect(result.find((m) => m.sourceId === "ability-b")).toBeDefined();
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

describe("prestige", () => {
  it("computes no gain below the scale threshold", () => {
    expect(applyPrestige(createInitialPrestigeState(), 99_999).prestigePoints).toBe(0);
  });

  it("computes diminishing-returns gain above the scale threshold", () => {
    // (12_800_000 / 100_000) ^ 0.65 = 128 ^ 0.65 = 23.4
    expect(applyPrestige(createInitialPrestigeState(), 12_800_000).prestigePoints).toBe(23);
  });

  it("scales the gain with run completion", () => {
    const st = createInitialPrestigeState();
    // 23.4 x (1 + 3 * completion)
    expect(applyPrestige(st, 12_800_000, undefined, 0.5).prestigePoints).toBe(58);
    expect(applyPrestige(st, 12_800_000, undefined, 1).prestigePoints).toBe(93);
    // completion alone never conjures points out of nothing
    expect(applyPrestige(st, 99_999, undefined, 1).prestigePoints).toBe(0);
  });

  it("sends the player back to square one: the worlds entered are wiped", () => {
    const after = applyPrestige({ prestigePoints: 1, unlockedAnimeIds: ["anime-a"] }, 12_800_000);
    expect(after).toEqual({ prestigePoints: 24, unlockedAnimeIds: [] });
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

  it("farms mobs instead of the boss once the player retreated from it", () => {
    expect(nextEnemy(arc, 3, [], false, true).id).not.toBe("a1-boss");
    expect(nextEnemy(arc, 3, [], false, false).id).toBe("a1-boss");
  });
});

describe("character growth", () => {
  const main: Character = {
    id: "m", name: "Main", animeId: "a", rarity: "main", arcIds: [], baseClickPower: 2, baseDps: 3,
    passive: { target: "clickPower", kind: "percent", value: 0.1 },
  };
  const side: Character = { ...main, id: "s", name: "Side", rarity: "secondary" };

  it("caps the passive at 10 for the main cast and 5 for the supporting one", () => {
    expect(PASSIVE_LEVEL_CAP).toEqual({ main: 10, secondary: 5 });
    expect(isPassiveMaxed(10, "main")).toBe(true);
    expect(isPassiveMaxed(5, "main")).toBe(false);
    expect(isPassiveMaxed(5, "secondary")).toBe(true);
    expect(passiveUpgrade(10, "main", 1e9)).toMatchObject({ maxed: true, cost: 0, affordable: false });
  });

  it("charges more copies of the origin item for each successive rank", () => {
    expect(passiveRankCost(0)).toBe(0);
    expect(passiveRankCost(2)).toBeGreaterThan(passiveRankCost(1));
    expect(passiveRankCost(10)).toBeGreaterThan(passiveRankCost(9));

    const cost = passiveRankCost(3);
    expect(passiveUpgrade(2, "main", cost)).toMatchObject({ cost, affordable: true, maxed: false });
    expect(passiveUpgrade(2, "main", cost - 1).affordable).toBe(false);
  });

  it("keeps adding the same damage every level, with no cap", () => {
    const at = (level: number) =>
      characterContributions(main, null, undefined, level).find((m) => m.target === "clickPower")!.value;
    // each level is worth the same slice of baseClickPower, forever
    const step = main.baseClickPower * LEVEL_DAMAGE_STEP;
    expect(at(1) - at(0)).toBeCloseTo(step);
    expect(at(100) - at(99)).toBeCloseTo(step);
    expect(levelGrowth(4)).toBeCloseTo(1 + 4 * LEVEL_DAMAGE_STEP);
  });

  it("leaves the passive out while locked, and deepens it rank by rank", () => {
    const passiveAt = (character: Character, rank: number) =>
      characterContributions(character, null, undefined, 0, rank).find((m) => m.kind === "percent");
    expect(passiveAt(main, 0)).toBeUndefined();
    expect(passiveAt(main, 1)!.value).toBeCloseTo(main.passive!.value);
    expect(passiveAt(main, 5)!.value).toBeGreaterThan(passiveAt(main, 1)!.value);
    expect(passiveAt(side, 5)!.value).toBeCloseTo(passiveAt(main, 5)!.value);
  });

  it("drops the passive entirely outside the character's own anime, even when ranked", () => {
    const foreignArc = makeArc("foreign-arc", "other-anime", 0, []);
    const contributions = characterContributions(main, foreignArc, undefined, 0, 5);
    expect(contributions.find((m) => m.kind === "percent")).toBeUndefined();
    expect(contributions.find((m) => m.target === "clickPower")!.value).toBeCloseTo(
      main.baseClickPower * defaultSynergyConfig.otherAnimeMalus
    );
  });
});

describe("xp and levels", () => {
  it("needs more xp for each successive level", () => {
    expect(xpToReach(0)).toBe(0);
    expect(xpToReach(2) - xpToReach(1)).toBeGreaterThan(xpToReach(1) - xpToReach(0));
  });

  it("reads the level back off accumulated xp", () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(xpToReach(5))).toBe(5);
    expect(levelFromXp(xpToReach(5) - 1)).toBe(4);
  });

  it("reports how far into the current level the character is", () => {
    const progress = xpProgress(xpToReach(3) + 10);
    expect(progress.level).toBe(3);
    expect(progress.into).toBe(10);
    expect(progress.need).toBe(xpToReach(4) - xpToReach(3));
  });

  it("grants xp well above the raw reward, so leveling never stalls under the uncapped curve", () => {
    expect(XP_PER_KILL_REWARD).toBeGreaterThan(1);
    // A modest run — 50 kills worth 100 reward each — should still land a good many levels in,
    // not a handful: a level with no cap has to keep meaning something on its own.
    const xpFromAModestRun = 50 * 100 * XP_PER_KILL_REWARD;
    expect(levelFromXp(xpFromAModestRun)).toBeGreaterThanOrEqual(20);
  });
});

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

    const oneTierIn = achievementContributions({ [ACHIEVEMENT_CATEGORIES[0].id]: ACHIEVEMENT_CATEGORIES[0].tiers[0] });
    expect(oneTierIn).toHaveLength(1);
    expect(oneTierIn[0]).toMatchObject({ target: "clickPower", kind: "percent" });

    expect(achievementContributions({})).toHaveLength(0);
  });
});

describe("narrator click", () => {
  it("grows with the number of allies, and with nothing else", () => {
    const alone = narratorClickPower(0);
    expect(narratorClickPower(3)).toBeGreaterThan(alone);
    expect(narratorClickPower(3) - narratorClickPower(2)).toBe(narratorClickPower(1) - alone);
  });
});

describe("store boot", () => {
  it("boots from a save that already holds a team", () => {
    // The empty-roster path never reads the passive helpers: only a save with characters does, which
    // is why a helper declared below the `allModifiers` memo blanked the app on reload and not on a
    // fresh run. Solid runs that memo as soon as something reads it, so its helpers must be hoisted.
    const save = {
      currency: 0,
      lifetimeEarned: 0,
      ownedCharacterIds: ["naruto-uzumaki", "kakashi-hatake"],
      activeArcId: "naruto-vagues",
      prestigePoints: 0,
      unlockedAnimeIds: ["naruto"],
      arcKills: {},
      clearedArcIds: [],
      characterXp: { "naruto-uzumaki": 500 },
      itemCounts: { "item-shuriken": 20 },
      passiveRanks: { "kakashi-hatake": 1 },
    };
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => JSON.stringify(save),
      setItem: () => {},
      removeItem: () => {},
    };

    try {
      const game = createRoot((dispose) => {
        const store = createGameStore(gameData);
        dispose();
        return store;
      });
      expect(game.ownedCharacters()).toHaveLength(2);
      expect(game.teamDps()).toBeGreaterThan(0);
      const kakashi = game.ownedCharacters().find((c) => c.id === "kakashi-hatake")!;
      expect(game.passiveRankOf(kakashi)).toBe(1);
      expect(game.passiveItemOf(kakashi)?.id).toBe("item-shuriken");
      expect(game.passiveUpgradeOf(kakashi).cost).toBeGreaterThan(0);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("carries overkill over to the next enemy instead of dropping it", () => {
    const testData = {
      animes: [{ id: "ta", name: "A", unlockCost: 0 }],
      arcs: [
        {
          id: "arc-a",
          animeId: "ta",
          name: "Arc A",
          order: 1,
          mobsToBoss: 1000,
          mobs: [{ id: "m1", name: "M1", baseHp: 1, reward: 1 }],
          boss: { id: "b1", name: "B1", baseHp: 1_000_000, reward: 1 },
        },
      ],
      characters: [
        {
          id: "hitter",
          name: "Hitter",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: ["arc-a"],
          baseClickPower: 1000,
          baseDps: 0,
        },
      ],
      combos: [],
      items: [],
    };
    const save = {
      currency: 0,
      lifetimeEarned: 0,
      ownedCharacterIds: ["hitter"],
      activeArcId: "arc-a",
      prestigePoints: 0,
      unlockedAnimeIds: ["ta"],
      arcKills: {},
      clearedArcIds: [],
      characterXp: {},
      itemCounts: {},
      passiveRanks: {},
      evolvedCharacterIds: [],
    };
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => JSON.stringify(save),
      setItem: () => {},
      removeItem: () => {},
    };

    try {
      const game = createRoot((dispose) => {
        const store = createGameStore(testData);
        dispose();
        return store;
      });
      const arc = game.activeArc()!;
      // ~1001 damage against 1-hp mobs: one hit has to land many kills, not exactly one, or a
      // late-game team can never farm an early arc faster than 5 fights a second.
      game.click();
      expect(game.killsIn(arc)).toBeGreaterThan(1);
      // ...and the safety net still stops there rather than looping forever.
      expect(game.killsIn(arc)).toBeLessThanOrEqual(100);
      expect(game.enemy()).not.toBeNull();
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("does not stack two abilities boosting the same stat: the second is locked out while the first's buff is up", () => {
    const testData = {
      animes: [],
      arcs: [],
      characters: [
        {
          id: "ca",
          name: "A",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 10,
          ability: {
            id: "ability-a",
            name: "A",
            cooldownMs: 0,
            durationMs: 10_000,
            effects: [{ id: "a-eff", target: "teamDps" as const, kind: "percent" as const, value: 1 }],
          },
        },
        {
          id: "cb",
          name: "B",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 0,
          ability: {
            id: "ability-b",
            name: "B",
            cooldownMs: 0,
            durationMs: 10_000,
            effects: [{ id: "b-eff", target: "teamDps" as const, kind: "percent" as const, value: 2 }],
          },
        },
      ],
      combos: [],
      items: [],
    };
    const save = {
      currency: 0,
      lifetimeEarned: 0,
      ownedCharacterIds: ["ca", "cb"],
      activeArcId: null,
      prestigePoints: 0,
      unlockedAnimeIds: [],
      arcKills: {},
      clearedArcIds: [],
      characterXp: {},
      itemCounts: {},
      passiveRanks: {},
    };
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => JSON.stringify(save),
      setItem: () => {},
      removeItem: () => {},
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });

      expect(game.teamDps()).toBe(10); // base dps only, no ability active yet
      game.activateAbility("ability-a");
      expect(game.teamDps()).toBeCloseTo(20); // 10 * (1 + 1.0)
      // ability-b touches the same stat and is locked out for the rest of ability-a's buff: it can't
      // fire yet, so its effect never applies (10 * (1 + 2.0) = 30 would mean it slipped through).
      expect(game.activateAbility("ability-b")).toBe(false);
      expect(game.teamDps()).toBeCloseTo(20);
    } finally {
      disposeRoot();
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("the free ability trigger never overwrites a stronger buff already running on that stat", () => {
    const ability = (id: string, value: number) => ({
      id,
      name: id,
      cooldownMs: 0,
      durationMs: 10_000,
      effects: [{ target: "teamDps" as const, kind: "percent" as const, value }],
    });
    const testData = {
      animes: [],
      arcs: [],
      characters: [
        {
          id: "ca",
          name: "A",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 10,
          ability: ability("ability-weak", 1),
        },
        {
          id: "cb",
          name: "B",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 0,
          ability: ability("ability-strong", 2),
        },
      ],
      combos: [],
      items: [],
    };
    const save = {
      currency: 0,
      lifetimeEarned: 0,
      ownedCharacterIds: ["ca", "cb"],
      activeArcId: null,
      prestigePoints: 0,
      unlockedAnimeIds: [],
      arcKills: {},
      clearedArcIds: [],
      characterXp: {},
      itemCounts: {},
      passiveRanks: {},
      // "Clic du Narrateur" fully bought: node 5 is the free-trigger proc.
      prestigeTreeRanks: { narratorClick: [5, 5, 5, 5, 5] },
    };
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => JSON.stringify(save),
      setItem: () => {},
      removeItem: () => {},
    };
    // 0 always clears the proc's odds, and always picks the first candidate.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });

      game.activateAbility("ability-strong");
      expect(game.teamDps()).toBeCloseTo(30); // 10 * (1 + 2.0)
      // The proc fires on this click. It must find no candidate — the weak ability targets the same
      // stat, and `replaceModifiersByTarget` would swap the x3 out for it (10 * (1 + 1.0) = 20).
      game.click();
      expect(game.teamDps()).toBeCloseTo(30);
    } finally {
      randomSpy.mockRestore();
      disposeRoot();
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("importSave refuses a blob whose fields are the wrong type", () => {
    const valid = {
      currency: 5,
      lifetimeEarned: 5,
      ownedCharacterIds: [],
      activeArcId: null,
      prestigePoints: 0,
      unlockedAnimeIds: [],
      arcKills: {},
      clearedArcIds: [],
      characterXp: {},
      itemCounts: {},
      passiveRanks: {},
      evolvedCharacterIds: [],
    };
    const stored: string[] = [];
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: (_k: string, v: string) => stored.push(v),
      removeItem: () => {},
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore({ animes: [], arcs: [], characters: [], combos: [], items: [] });
      });
      const blob = (save: unknown) => btoa(JSON.stringify(save));

      expect(game.importSave("not base64 at all")).toBe(false);
      expect(game.importSave(blob({ currency: "rich", ownedCharacterIds: [] }))).toBe(false);
      expect(game.importSave(blob({ ...valid, arcKills: "abc" }))).toBe(false);
      expect(game.importSave(blob({ ...valid, ownedCharacterIds: [1, 2] }))).toBe(false);
      expect(game.importSave(blob({ ...valid, prestigeTreeRanks: { xp: ["1"] } }))).toBe(false);
      expect(game.importSave(blob({ ...valid, characterEquipment: { ca: 7 } }))).toBe(false);
      expect(stored).toEqual([]); // nothing bad ever reached localStorage

      // ...and a well-formed one still goes through, missing optional fields included.
      expect(game.importSave(blob(valid))).toBe(true);
      expect(stored).toHaveLength(1);
    } finally {
      disposeRoot();
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("abilitiesShareType: true when effects touch a common stat, false otherwise", () => {
    const dps: import("./types").AbilityDefinition = {
      id: "dps",
      name: "dps",
      cooldownMs: 0,
      durationMs: 0,
      effects: [{ target: "teamDps", kind: "percent", value: 1 }],
    };
    const dpsToo: import("./types").AbilityDefinition = {
      id: "dpsToo",
      name: "dpsToo",
      cooldownMs: 0,
      durationMs: 0,
      effects: [{ target: "teamDps", kind: "multiplier", value: 2 }],
    };
    const click: import("./types").AbilityDefinition = {
      id: "click",
      name: "click",
      cooldownMs: 0,
      durationMs: 0,
      effects: [{ target: "clickPower", kind: "percent", value: 1 }],
    };
    const both: import("./types").AbilityDefinition = {
      id: "both",
      name: "both",
      cooldownMs: 0,
      durationMs: 0,
      effects: [
        { target: "teamDps", kind: "percent", value: 1 },
        { target: "clickPower", kind: "percent", value: 1 },
      ],
    };
    expect(abilitiesShareType(dps, dpsToo)).toBe(true);
    expect(abilitiesShareType(dps, click)).toBe(false);
    expect(abilitiesShareType(both, dps)).toBe(true);
    expect(abilitiesShareType(both, click)).toBe(true);
  });

  it("activating an ability also starts the cooldown of other abilities touching the same stat", () => {
    const testData = {
      animes: [],
      arcs: [],
      characters: [
        {
          id: "ca",
          name: "A",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 10,
          ability: {
            id: "ability-a",
            name: "A",
            cooldownMs: 30_000,
            durationMs: 10_000,
            effects: [{ id: "a-eff", target: "teamDps" as const, kind: "percent" as const, value: 1 }],
          },
        },
        {
          id: "cb",
          name: "B",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 0,
          ability: {
            id: "ability-b",
            name: "B",
            cooldownMs: 30_000,
            durationMs: 10_000,
            // same stat as ability-a: must go on cooldown too, even though never activated
            effects: [{ id: "b-eff", target: "teamDps" as const, kind: "percent" as const, value: 2 }],
          },
        },
        {
          id: "cc",
          name: "C",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 5,
          baseDps: 0,
          ability: {
            id: "ability-c",
            name: "C",
            cooldownMs: 30_000,
            durationMs: 10_000,
            // different stat: must stay ready
            effects: [{ id: "c-eff", target: "clickPower" as const, kind: "percent" as const, value: 1 }],
          },
        },
      ],
      combos: [],
      items: [],
    };
    const save = {
      currency: 0,
      lifetimeEarned: 0,
      ownedCharacterIds: ["ca", "cb", "cc"],
      activeArcId: null,
      prestigePoints: 0,
      unlockedAnimeIds: [],
      arcKills: {},
      clearedArcIds: [],
      characterXp: {},
      itemCounts: {},
      passiveRanks: {},
    };
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => JSON.stringify(save),
      setItem: () => {},
      removeItem: () => {},
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });

      game.activateAbility("ability-a");
      expect(game.abilityCooldownRemaining("ability-b")).toBeGreaterThan(0);
      expect(game.abilityCooldownRemaining("ability-c")).toBe(0);
      expect(game.activateAbility("ability-b")).toBe(false);
    } finally {
      disposeRoot();
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("same-stat abilities are locked for the just-activated ability's buff duration, not its cooldown", () => {
    const testData = {
      animes: [],
      arcs: [],
      characters: [
        {
          id: "ca",
          name: "A",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 10,
          ability: {
            id: "ability-a",
            name: "A",
            cooldownMs: 30_000,
            durationMs: 20_000,
            effects: [{ id: "a-eff", target: "teamDps" as const, kind: "percent" as const, value: 1 }],
          },
        },
        {
          id: "cb",
          name: "B",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 0,
          ability: {
            id: "ability-b",
            name: "B",
            cooldownMs: 5_000,
            durationMs: 10_000,
            // shorter cooldown than A, same stat: must still be locked for A's whole 20s buff
            effects: [{ id: "b-eff", target: "teamDps" as const, kind: "percent" as const, value: 2 }],
          },
        },
        {
          id: "cc",
          name: "C",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 0,
          ability: {
            id: "ability-c",
            name: "C",
            cooldownMs: 5_000,
            durationMs: 10_000,
            // different stat: never locked by A
            effects: [{ id: "c-eff", target: "clickPower" as const, kind: "percent" as const, value: 3 }],
          },
        },
      ],
      combos: [],
      items: [],
    };
    const save = {
      currency: 0,
      lifetimeEarned: 0,
      ownedCharacterIds: ["ca", "cb", "cc"],
      activeArcId: null,
      prestigePoints: 0,
      unlockedAnimeIds: [],
      arcKills: {},
      clearedArcIds: [],
      characterXp: {},
      itemCounts: {},
      passiveRanks: {},
    };
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => JSON.stringify(save),
      setItem: () => {},
      removeItem: () => {},
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });

      game.activateAbility("ability-a");
      // A's own cooldown is unaffected by this feature: still running its normal 30s.
      expect(game.abilityCooldownRemaining("ability-a")).toBeGreaterThan(20_000);
      // B is locked for A's 20s buff duration, well past B's own 5s cooldown.
      const bRemaining = game.abilityCooldownRemaining("ability-b");
      expect(bRemaining).toBeGreaterThan(15_000);
      expect(bRemaining).toBeLessThanOrEqual(20_000);
      expect(game.activateAbility("ability-b")).toBe(false);
      // C touches a different stat: never locked, ready throughout.
      expect(game.abilityCooldownRemaining("ability-c")).toBe(0);
    } finally {
      disposeRoot();
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("never blocks on a boss: a timeout falls back to farming, until the player rematches it", () => {
    const testData = {
      animes: [{ id: "ta", name: "TA", unlockCost: 0 }],
      arcs: [
        {
          id: "ta-arc",
          animeId: "ta",
          name: "Arc",
          order: 0,
          mobsToBoss: 1,
          mobs: [{ id: "ta-mob", name: "Mob", baseHp: 1, reward: 1 }],
          boss: { id: "ta-boss", name: "Boss", baseHp: 1_000_000, reward: 100, timerMs: 1_000 },
        },
      ],
      characters: [],
      combos: [],
      items: [],
    };
    const arc = testData.arcs[0];

    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });

      game.travelTo("ta");
      game.click(); // kills the one mob standing before the boss
      expect(game.enemy()?.id).toBe("ta-boss");

      // The boss vastly outlives the player's damage: let its timer run out.
      vi.advanceTimersByTime(1_200);
      expect(game.hasRetreatedFromBoss(arc)).toBe(true);
      expect(game.enemy()?.id).toBe("ta-mob");
      expect(game.bossChallengeable(arc)).toBe(true);

      game.challengeBoss();
      expect(game.hasRetreatedFromBoss(arc)).toBe(false);
      expect(game.enemy()?.id).toBe("ta-boss");
    } finally {
      disposeRoot();
      vi.useRealTimers();
    }
  });

  it("clearing an arc grants no prestige point — points only come from a prestige reset", () => {
    const testData = {
      animes: [{ id: "ta", name: "TA", unlockCost: 0 }],
      arcs: [
        {
          id: "ta-arc",
          animeId: "ta",
          name: "Arc",
          order: 0,
          mobsToBoss: 0,
          mobs: [{ id: "ta-mob", name: "Mob", baseHp: 1, reward: 1 }],
          boss: { id: "ta-boss", name: "Boss", baseHp: 1, reward: 100 },
        },
      ],
      characters: [],
      combos: [],
      items: [],
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });

      game.travelTo("ta");
      expect(game.enemy()?.id).toBe("ta-boss");
      expect(game.prestige().prestigePoints).toBe(0);

      game.click(); // kills the boss, clearing the arc
      expect(game.prestige().prestigePoints).toBe(0);

      game.click();
      expect(game.prestige().prestigePoints).toBe(0);
    } finally {
      disposeRoot();
    }
  });

  it("buyShopOffer spends currency for item copies or a character, gated by cost and condition", () => {
    const testData = {
      animes: [{ id: "ta", name: "TA", unlockCost: 0 }],
      arcs: [
        {
          id: "ta-arc",
          animeId: "ta",
          name: "Arc",
          order: 0,
          mobsToBoss: 0,
          mobs: [{ id: "ta-mob", name: "Mob", baseHp: 1, reward: 1 }],
          boss: { id: "ta-boss", name: "Boss", baseHp: 1, reward: 100 },
        },
      ],
      characters: [
        { id: "special-char", name: "Special", animeId: "ta", rarity: "secondary" as const, arcIds: [], baseClickPower: 0, baseDps: 0 },
      ],
      combos: [],
      items: [{ id: "item-x", name: "X", kind: "common" as const }],
      shop: [
        { id: "offer-item", kind: "item" as const, targetId: "item-x", cost: 10, amount: 2 },
        { id: "offer-char", kind: "character" as const, targetId: "special-char", cost: 20, requiresAnimeId: "ta" },
      ],
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });

      // Not enough currency yet, and the character offer's anime isn't cleared yet.
      expect(game.buyShopOffer("offer-item")).toBe(false);
      expect(game.buyShopOffer("offer-char")).toBe(false);
      expect(game.shopOffers().find((o) => o.offer.id === "offer-char")?.locked).toBe(true);

      game.travelTo("ta");
      game.click(); // kills the boss directly (mobsToBoss: 0), clearing the arc and its anime
      expect(game.currency()).toBe(100);
      expect(game.shopOffers().find((o) => o.offer.id === "offer-char")?.locked).toBe(false);

      expect(game.buyShopOffer("offer-item")).toBe(true);
      expect(game.currency()).toBe(90);
      expect(game.countOf("item-x")).toBe(2);

      expect(game.buyShopOffer("offer-char")).toBe(true);
      expect(game.currency()).toBe(70);
      expect(game.ownedCharacterIds()).toContain("special-char");
      // bought once: the offer is now flagged owned (ShopPanel hides it), and can't be bought again
      expect(game.shopOffers().find((o) => o.offer.id === "offer-char")?.owned).toBe(true);
      expect(game.buyShopOffer("offer-char")).toBe(false);
      expect(game.currency()).toBe(70);
    } finally {
      disposeRoot();
    }
  });
});

describe("layoutArcs", () => {
  const arcs = (count: number) =>
    Array.from({ length: count }, (_, i) => makeArc(`arc-${i}`, "anime-a", i, []));

  const cellOffset = (value: number, index: number, span: number) => value * span - index;

  it("returns an empty layout for no arcs, without dividing by zero", () => {
    expect(layoutArcs([])).toEqual({ nodes: [], cols: 1, rows: 1 });
  });

  it("places a single arc within its cell", () => {
    const layout = layoutArcs(arcs(1));
    expect(layout.cols).toBe(1);
    expect(layout.rows).toBe(1);
    expect(layout.nodes).toHaveLength(1);
    expect(cellOffset(layout.nodes[0].x, layout.nodes[0].col, layout.cols)).toBeGreaterThanOrEqual(0.32);
    expect(cellOffset(layout.nodes[0].x, layout.nodes[0].col, layout.cols)).toBeLessThanOrEqual(0.68);
  });

  it("snakes a Naruto-shaped 5-arc world across two rows", () => {
    const layout = layoutArcs(arcs(5));
    expect(layout.cols).toBe(MAP_COLS);
    expect(layout.rows).toBe(2);
    // index 4 starts row 1 (the reversed row), landing directly under index 3's column.
    expect(layout.nodes[4].row).toBe(1);
    expect(layout.nodes[4].col).toBe(layout.nodes[3].col);
  });

  it("fits a Shippūden-shaped 15-arc world with no overlapping cells", () => {
    const layout = layoutArcs(arcs(15));
    expect(layout.cols).toBe(MAP_COLS);
    expect(layout.rows).toBe(4);
    expect(layout.nodes.filter((n) => n.row === 3)).toHaveLength(3);

    const cells = new Set(layout.nodes.map((n) => `${n.col},${n.row}`));
    expect(cells.size).toBe(layout.nodes.length);

    for (const node of layout.nodes) {
      expect(cellOffset(node.x, node.col, layout.cols)).toBeGreaterThanOrEqual(0.32);
      expect(cellOffset(node.x, node.col, layout.cols)).toBeLessThanOrEqual(0.68);
      expect(cellOffset(node.y, node.row, layout.rows)).toBeGreaterThanOrEqual(0.32);
      expect(cellOffset(node.y, node.row, layout.rows)).toBeLessThanOrEqual(0.68);
    }
  });

  it("is deterministic and preserves arc order", () => {
    const input = arcs(7);
    const a = layoutArcs(input);
    const b = layoutArcs(input);
    expect(a).toEqual(b);
    expect(a.nodes.map((n) => n.arc.id)).toEqual(input.map((arc) => arc.id));
  });
});

describe("game data", () => {
  it("keeps every id unique and every reference resolvable", () => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes(gameData.characters.map((c) => c.id))).toEqual([]);
    expect(dupes(gameData.items.map((i) => i.id))).toEqual([]);
    expect(dupes(gameData.arcs.map((a) => a.id))).toEqual([]);
    expect(dupes(gameData.animes.map((a) => a.id))).toEqual([]);

    const characterIds = gameData.characters.map((c) => c.id);
    const itemIds = gameData.items.map((i) => i.id);
    for (const arc of gameData.arcs) {
      expect(gameData.animes.some((a) => a.id === arc.animeId)).toBe(true);
      for (const enemy of [...arc.mobs, arc.boss]) {
        if (enemy.characterId) expect(characterIds).toContain(enemy.characterId);
        if (enemy.itemId) expect(itemIds).toContain(enemy.itemId);
      }
      // one common item per arc: it is what the passives of that arc's characters are paid with
      expect(arc.mobs.some((m) => m.itemId)).toBe(true);
    }
    for (const combo of gameData.combos) {
      for (const id of combo.requiredCharacterIds) expect(characterIds).toContain(id);
    }
    const animeIds = gameData.animes.map((a) => a.id);
    for (const offer of gameData.shop ?? []) {
      expect(offer.kind === "item" ? itemIds : characterIds).toContain(offer.targetId);
      if (offer.requiresAnimeId) expect(animeIds).toContain(offer.requiresAnimeId);
    }
  });

  it("recruits each character in exactly one world, and never twice", () => {
    const recruited = gameData.arcs.flatMap((a) => [...a.mobs, a.boss]).map((e) => e.characterId).filter(Boolean);
    expect(recruited.filter((id, i) => recruited.indexOf(id) !== i)).toEqual([]);
    for (const character of gameData.characters) {
      const arc = gameData.arcs.find(
        (a) => a.boss.characterId === character.id || a.mobs.some((m) => m.characterId === character.id)
      );
      expect(arc, `${character.id} n'est recrutable nulle part`).toBeDefined();
      expect(arc!.animeId).toBe(character.animeId);
      for (const arcId of character.arcIds) {
        expect(gameData.arcs.find((a) => a.id === arcId)?.animeId).toBe(character.animeId);
      }
    }
  });

  it("leaves every arc a mob pool that survives recruiting its whole cast", () => {
    // `encounterPool` falls back to the non-recruit mobs once every character of the zone has
    // joined. With none, `nextEnemy` hands back the boss forever and a cleared arc re-clears itself
    // on every kill. No arc is in that state today; this keeps it that way.
    for (const arc of gameData.arcs) {
      expect(arc.mobs.some((m) => !m.characterId), `${arc.id} n'a que des mobs recrutables`).toBe(true);
    }
  });

  it("keeps every hand-picked world hue inside the HSL wheel", () => {
    for (const anime of gameData.animes) {
      if (anime.themeHue === undefined) continue;
      expect(anime.themeHue, `${anime.id}'s themeHue must be a 0..360 hue`).toBeGreaterThanOrEqual(0);
      expect(anime.themeHue).toBeLessThan(360);
    }
  });

  it("only evolves characters into a later anime of their own universe", () => {
    for (const character of gameData.characters) {
      if (!character.evolution) continue;
      const evolvesInto = gameData.animes.find((a) => a.id === character.evolution!.animeId);
      expect(evolvesInto, `${character.id} evolves into an unknown anime`).toBeDefined();
      expect(evolvesInto!.requiresAnimeId, `${character.id}'s evolution must be its own anime's sequel`).toBe(
        character.animeId
      );
    }
  });
});

describe("universe order", () => {
  const animes: Anime[] = [
    { id: "w1", name: "W1", unlockCost: 1 },
    { id: "w2", name: "W2", unlockCost: 1, requiresAnimeId: "w1" },
    { id: "w3", name: "W3", unlockCost: 1, requiresAnimeId: "w2" },
  ];
  const arcs = [makeArc("w1-a", "w1", 0, []), makeArc("w2-a", "w2", 0, []), makeArc("w3-a", "w3", 0, [])];

  it("opens a sequel only once its predecessor is cleared", () => {
    expect(isAnimeAvailable(animes, "w1", arcs, [])).toBe(true);
    expect(isAnimeAvailable(animes, "w2", arcs, [])).toBe(false);
    expect(isAnimeAvailable(animes, "w2", arcs, ["w1-a"])).toBe(true);
    // the last world stays shut until the middle one is done, not just the first
    expect(isAnimeAvailable(animes, "w3", arcs, ["w1-a"])).toBe(false);
    expect(isAnimeAvailable(animes, "w3", arcs, ["w1-a", "w2-a"])).toBe(true);
  });

  it("ships Shippuden behind part 1", () => {
    const shippuden = gameData.animes.find((a) => a.id === "shippuden")!;
    expect(shippuden.requiresAnimeId).toBe("naruto");
    expect(isAnimeAvailable(gameData.animes, "shippuden", gameData.arcs, [])).toBe(false);
    expect(isAnimeAvailable(gameData.animes, "naruto", gameData.arcs, [])).toBe(true);

    const narutoArcIds = gameData.arcs.filter((a) => a.animeId === "naruto").map((a) => a.id);
    expect(isAnimeAvailable(gameData.animes, "shippuden", gameData.arcs, narutoArcIds)).toBe(true);
  });

  it("refuses the paid shortcut into a world whose predecessor is unfinished", () => {
    const game = createRoot((dispose) => {
      const store = createGameStore(gameData);
      dispose();
      return store;
    });
    expect(game.travelTo("shippuden")).toBe(false);
    expect(game.unlockAnime("shippuden")).toBe(false);
    expect(game.animeBlockedBy("shippuden")?.id).toBe("naruto");
    expect(game.travelTo("naruto")).toBe(true);
  });
});

describe("prestige tree — pure functions", () => {
  const categoryOf = (id: string) => PRESTIGE_TREE_CATEGORIES.find((c) => c.id === id)!;

  it("starts fully locked except node 1", () => {
    expect(nodeLevels({}, "xp")).toEqual([0, 0, 0, 0, 0]);
    expect(isNodeUnlocked([0, 0, 0, 0, 0], 1)).toBe(true);
    expect(isNodeUnlocked([0, 0, 0, 0, 0], 2)).toBe(false);
  });

  it("unlocks a node as soon as its predecessor has just one level, not once it's maxed", () => {
    expect(isNodeUnlocked([1, 0, 0, 0, 0], 2)).toBe(true);
    expect(isNodeUnlocked([1, 0, 0, 0, 0], 3)).toBe(false); // node 2 itself still has 0 levels
    expect(isNodeUnlocked([1, 1, 0, 0, 0], 3)).toBe(true);
  });

  it("reads one node's level out of the branch's level array", () => {
    expect(nodeLevel([3, 1, 0, 0, 0], 1)).toBe(3);
    expect(nodeLevel([3, 1, 0, 0, 0], 2)).toBe(1);
    expect(nodeLevel([3, 1, 0, 0, 0], 3)).toBe(0);
  });

  it("sums a branch's node levels for the header readout", () => {
    expect(totalLevels([2, 1, 0, 0, 0])).toBe(3);
    expect(totalLevels([5, 5, 5, 5, 5])).toBe(LEVELS_PER_BRANCH);
  });

  it("buys levels of one specific node in order, deducting their cost", () => {
    const narratorClick = categoryOf("narratorClick");
    const first = purchaseNodeLevel(10, {}, narratorClick, 1)!;
    expect(first.ranks.narratorClick).toEqual([1, 0, 0, 0, 0]);
    expect(first.prestigePoints).toBe(10 - 2); // LEVEL_COSTS[0]

    const second = purchaseNodeLevel(first.prestigePoints, first.ranks, narratorClick, 1)!;
    expect(second.ranks.narratorClick).toEqual([2, 0, 0, 0, 0]);
    expect(second.prestigePoints).toBe(first.prestigePoints - 3); // LEVEL_COSTS[1]
  });

  it("resets the cost curve at the start of every node", () => {
    const narratorClick = categoryOf("narratorClick");
    const oneLevelIn = { narratorClick: [1, 0, 0, 0, 0] };
    const next = purchaseNodeLevel(2, oneLevelIn, narratorClick, 2)!;
    expect(next.ranks.narratorClick).toEqual([1, 1, 0, 0, 0]); // node 2's first level costs 2, not 31-derived
    expect(next.prestigePoints).toBe(0);
  });

  it("lets any unlocked node be bought, not just the lowest-position one", () => {
    const narratorClick = categoryOf("narratorClick");
    // node 1 has a level (unlocking node 2), but the player buys node 2 while node 1 sits at 1/5.
    const ranks = { narratorClick: [1, 0, 0, 0, 0] };
    const result = purchaseNodeLevel(2, ranks, narratorClick, 2)!;
    expect(result.ranks.narratorClick).toEqual([1, 1, 0, 0, 0]);
  });

  it("refuses to buy a locked node, or without enough points, leaving other branches untouched", () => {
    const narratorClick = categoryOf("narratorClick");
    expect(canPurchaseNodeLevel(999, {}, narratorClick, 2)).toBe(false); // node 2 still locked
    expect(purchaseNodeLevel(999, {}, narratorClick, 2)).toBeNull();
    expect(canPurchaseNodeLevel(1, {}, narratorClick, 1)).toBe(false); // not enough points
    expect(purchaseNodeLevel(1, {}, narratorClick, 1)).toBeNull();

    const result = purchaseNodeLevel(100, { teamDps: [2, 0, 0, 0, 0] }, narratorClick, 1)!;
    expect(result.ranks).toEqual({ teamDps: [2, 0, 0, 0, 0], narratorClick: [1, 0, 0, 0, 0] });
  });

  it("refuses once a node is fully bought", () => {
    const narratorClick = categoryOf("narratorClick");
    const maxed = { narratorClick: [LEVELS_PER_NODE, 0, 0, 0, 0] };
    expect(canPurchaseNodeLevel(999, maxed, narratorClick, 1)).toBe(false);
    expect(purchaseNodeLevel(999, maxed, narratorClick, 1)).toBeNull();
  });

  it("nodeCost is null when locked or maxed, and follows LEVEL_COSTS otherwise", () => {
    expect(nodeCost([0, 0, 0, 0, 0], 2)).toBeNull(); // locked
    expect(nodeCost([LEVELS_PER_NODE, 0, 0, 0, 0], 1)).toBeNull(); // maxed
    expect(nodeCost([0, 0, 0, 0, 0], 1)).toBe(LEVEL_COSTS[0]);
    expect(nodeCost([2, 0, 0, 0, 0], 1)).toBe(LEVEL_COSTS[2]);
  });

  it("softenedSynergyConfig narrows a malus toward 1.0 more with each level, never past it", () => {
    const config = { matchingArcMultiplier: 1, sameAnimeMalus: 0.75, otherAnimeMalus: 0.4 };
    expect(softenedSynergyConfig(config, 0)).toEqual(config);
    const level1 = softenedSynergyConfig(config, 1);
    const level2 = softenedSynergyConfig(config, 2);
    expect(level1.sameAnimeMalus).toBeGreaterThan(config.sameAnimeMalus);
    expect(level2.sameAnimeMalus).toBeGreaterThan(level1.sameAnimeMalus);
    expect(level2.sameAnimeMalus).toBeLessThanOrEqual(1);
    expect(level1.matchingArcMultiplier).toBe(config.matchingArcMultiplier);
  });

  it("scales a branch's flat percent by its node 1 level", () => {
    expect(prestigeTreeContributions({})).toEqual([]);
    const mods = prestigeTreeContributions({ narratorClick: [3, 0, 0, 0, 0], teamDps: [1, 0, 0, 0, 0] });
    expect(mods.find((m) => m.target === "clickPower")?.value).toBeCloseTo(NARRATOR_CLICK_PERCENT * 3);
    expect(mods.find((m) => m.target === "teamDps")?.value).toBeCloseTo(TEAM_DPS_PERCENT * 1);
  });
});

describe("prestige tree — wired into gameState", () => {
  function makeTestData(opts: { mobBaseHp?: number; mobItemId?: string; mobDropChance?: number; shop?: ShopOffer[] } = {}) {
    const mob: Enemy = {
      id: "ta-mob",
      name: "Mob",
      // Exactly one click's worth of hp (narrator base 2 + the character's flat 10), so these
      // per-kill assertions stay "one click = one kill" now that overkill carries into the next
      // enemy — a 1-hp mob would let a single click chain a dozen kills.
      baseHp: opts.mobBaseHp ?? 12,
      reward: 10,
      ...(opts.mobItemId ? { itemId: opts.mobItemId, dropChance: opts.mobDropChance ?? 1 } : {}),
    };
    return {
      animes: [{ id: "ta", name: "TA", unlockCost: 0 }],
      arcs: [
        {
          id: "ta-arc",
          animeId: "ta",
          name: "Arc",
          order: 0,
          mobsToBoss: 1_000,
          mobs: [mob],
          boss: { id: "ta-boss", name: "Boss", baseHp: 1_000_000, reward: 1_000 },
        },
      ],
      characters: [
        {
          id: "ca",
          name: "A",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: ["ta-arc"],
          baseClickPower: 10,
          baseDps: 0,
        },
      ],
      combos: [],
      items: opts.mobItemId ? [{ id: opts.mobItemId, name: "Item", kind: "common" as const }] : [],
      shop: opts.shop,
    };
  }

  function baseSave(overrides: Record<string, unknown> = {}) {
    return {
      currency: 0,
      lifetimeEarned: 0,
      ownedCharacterIds: ["ca"],
      activeArcId: "ta-arc",
      prestigePoints: 0,
      unlockedAnimeIds: ["ta"],
      arcKills: {},
      clearedArcIds: [],
      characterXp: {},
      itemCounts: {},
      passiveRanks: {},
      evolvedCharacterIds: [],
      achievementCounts: {},
      prestigeTreeRanks: {},
      ...overrides,
    };
  }

  function installSave(save: unknown): () => void {
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => JSON.stringify(save),
      setItem: () => {},
      removeItem: () => {},
    };
    return () => {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    };
  }

  it("Clic du Narrateur node 2 fires an automatic click every AUTOCLICK_INTERVAL_MS", () => {
    const testData = makeTestData({ mobBaseHp: 1_000_000 });
    // node 1 has just 1 level (enough to unlock node 2) + 1 level into node 2, the autoclicker.
    const restore = installSave(baseSave({ prestigeTreeRanks: { narratorClick: [1, 1, 0, 0, 0] } }));
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      const hpBefore = game.enemyHpLeft();
      const expectedHit = game.clickPower() * AUTOCLICK_POWER_FRACTION;
      vi.advanceTimersByTime(AUTOCLICK_INTERVAL_MS);
      expect(hpBefore - game.enemyHpLeft()).toBeCloseTo(expectedHit, 5);
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  });

  it("DPS Équipe node 3 softens the synergy malus outside the active arc's anime", () => {
    const testData = {
      animes: [
        { id: "ta", name: "TA", unlockCost: 0 },
        { id: "tb", name: "TB", unlockCost: 0 },
      ],
      arcs: [
        {
          id: "ta-arc",
          animeId: "ta",
          name: "A",
          order: 0,
          mobsToBoss: 1_000,
          mobs: [{ id: "ta-mob", name: "Mob", baseHp: 1, reward: 1 }],
          boss: { id: "ta-boss", name: "Boss", baseHp: 1_000_000, reward: 100 },
        },
        {
          id: "tb-arc",
          animeId: "tb",
          name: "B",
          order: 0,
          mobsToBoss: 1_000,
          mobs: [{ id: "tb-mob", name: "Mob", baseHp: 1, reward: 1 }],
          boss: { id: "tb-boss", name: "Boss", baseHp: 1_000_000, reward: 100 },
        },
      ],
      characters: [
        {
          id: "ca",
          name: "A",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: ["ta-arc"],
          baseClickPower: 1,
          baseDps: 1,
        },
      ],
      combos: [],
      items: [],
    };
    const character = testData.characters[0];
    const commonSave = { unlockedAnimeIds: ["ta", "tb"], activeArcId: "tb-arc", ownedCharacterIds: ["ca"] };

    let disposeRoot!: () => void;
    let baseline!: number;
    const restoreBase = installSave(baseSave(commonSave));
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      baseline = game.synergyOf(character);
    } finally {
      disposeRoot();
      restoreBase();
    }

    // 1 level in nodes 1 and 2 (each unlocking the next) + 1 level into node 3, the synergy softener.
    const restoreBoosted = installSave(baseSave({ ...commonSave, prestigeTreeRanks: { teamDps: [1, 1, 1, 0, 0] } }));
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      expect(game.synergyOf(character)).toBeGreaterThan(baseline);
    } finally {
      disposeRoot();
      restoreBoosted();
    }
  });

  it("XP node 1 level 1 boosts the xp granted per kill", () => {
    const testData = makeTestData();
    const restore = installSave(baseSave({ prestigeTreeRanks: { xp: [1, 0, 0, 0, 0] } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      game.click(); // kills the 1-hp mob
      expect(game.xpOf("ca")).toBeCloseTo(10 * XP_PER_KILL_REWARD * (1 + XP_GAIN_PERCENT));
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("Objets node 1 level 1 boosts the effective drop chance", () => {
    const testData = makeTestData({ mobItemId: "ta-item", mobDropChance: 0.5 });
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.55); // between the base and boosted chance

    const restoreLocked = installSave(baseSave());
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      game.click();
      expect(game.countOf("ta-item")).toBe(0); // 0.55 misses the base 0.5 chance
    } finally {
      disposeRoot();
      restoreLocked();
    }

    const restoreBoosted = installSave(baseSave({ prestigeTreeRanks: { items: [1, 0, 0, 0, 0] } }));
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      game.click();
      // 0.5 * (1 + DROP_CHANCE_BOOST) = 0.6, so the same 0.55 roll now hits
      expect(game.countOf("ta-item")).toBe(1);
    } finally {
      disposeRoot();
      restoreBoosted();
      randomSpy.mockRestore();
    }
  });

  it("Objets node 2 level 1 discounts the cost of the next passive rank", () => {
    const testData = makeTestData();
    const character = testData.characters[0];

    let disposeRoot!: () => void;
    let baseCost!: number;
    // Rank 1 (cost 6) survives the 15% discount's rounding unchanged (ceil(6*0.85)=6 too), so seed
    // the character at rank 1 already: rank 2 costs 9 base vs 8 discounted, where it actually shows.
    const restoreBase = installSave(baseSave({ passiveRanks: { ca: 1 } }));
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      baseCost = game.passiveUpgradeOf(character).cost;
    } finally {
      disposeRoot();
      restoreBase();
    }

    // node 1 has 1 level (unlocking node 2) + 1 level into node 2, the passive-rank discount.
    const restoreDiscount = installSave(
      baseSave({ passiveRanks: { ca: 1 }, prestigeTreeRanks: { items: [1, 1, 0, 0, 0] } })
    );
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      expect(game.passiveUpgradeOf(character).cost).toBeLessThan(baseCost);
    } finally {
      disposeRoot();
      restoreDiscount();
    }
  });

  it("Destin node 1 level 1 boosts the currency reward from a kill", () => {
    const testData = makeTestData();
    const restore = installSave(baseSave({ prestigeTreeRanks: { destin: [1, 0, 0, 0, 0] } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      game.click();
      expect(game.currency()).toBeCloseTo(10 * (1 + CURRENCY_GAIN_PERCENT));
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("Destin node 2 level 1 has a small chance to grant 1 prestige point per kill", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const testData = makeTestData();
    const restore = installSave(baseSave({ prestigeTreeRanks: { destin: [1, 1, 0, 0, 0] } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      game.click();
      expect(game.prestige().prestigePoints).toBe(1);
    } finally {
      disposeRoot();
      restore();
      vi.restoreAllMocks();
    }
  });

  it("Destin node 3 level 1 can grant a second common copy on the same drop", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const testData = makeTestData({ mobItemId: "common-item", mobDropChance: 1, shop: [] });
    const restore = installSave(baseSave({ prestigeTreeRanks: { destin: [1, 1, 1, 0, 0] } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      game.click();
      expect(game.countOf("common-item")).toBe(2);
    } finally {
      disposeRoot();
      restore();
      vi.restoreAllMocks();
    }
  });

  it("Destin node 4 level 1 discounts shop offer prices", () => {
    const testData = makeTestData({ shop: [{ id: "shop-item", kind: "item", targetId: "common-item", cost: 100, amount: 1 }] });
    const discountedCost = Math.ceil(100 * (1 - SHOP_COST_DISCOUNT));
    const restore = installSave(
      baseSave({ currency: discountedCost, prestigeTreeRanks: { destin: [1, 1, 1, 1, 0] } })
    );
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      const offers = game.shopOffers();
      expect(offers[0].affordable).toBe(true);
      expect(game.buyShopOffer("shop-item")).toBe(true);
      expect(game.currency()).toBeCloseTo(0);
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("purchaseTreeLevel unlocks the next node after just one level, and lets both be bought", () => {
    const testData = makeTestData();
    const restore = installSave(baseSave({ prestigePoints: 2 * LEVEL_COSTS[0] }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      expect(game.nodeLevelOf("narratorClick", 1)).toBe(0);
      expect(game.isNodeUnlockedFor("narratorClick", 2)).toBe(false);
      expect(game.nodeCostOf("narratorClick", 1)).toBe(LEVEL_COSTS[0]);

      expect(game.purchaseTreeLevel("narratorClick", 1)).toBe(true);
      expect(game.nodeLevelOf("narratorClick", 1)).toBe(1);
      expect(game.isNodeUnlockedFor("narratorClick", 2)).toBe(true); // unlocked by just 1 level
      expect(game.branchLevelsOf("narratorClick")).toBe(1);

      // Node 2 is now purchasable while node 1 still has 4 levels left — order is the player's choice.
      expect(game.purchaseTreeLevel("narratorClick", 2)).toBe(true);
      expect(game.nodeLevelOf("narratorClick", 2)).toBe(1);
      expect(game.branchLevelsOf("narratorClick")).toBe(2);
      expect(game.prestige().prestigePoints).toBe(0);
      expect(game.purchaseTreeLevel("narratorClick", 1)).toBe(false); // no points left
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("equipping a unique item boosts the matching stat", () => {
    const testData = {
      ...makeTestData(),
      items: [
        {
          id: "unique-click",
          name: "Click Multiplier",
          kind: "unique" as const,
          effects: [{ id: "u-click", target: "clickPower" as const, kind: "multiplier" as const, value: 2 }],
        },
      ],
    };
    const restore = installSave(baseSave({ itemCounts: { "unique-click": 1 } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      const character = testData.characters[0];
      const baseClick = game.clickPower();
      expect(game.equipItem(character.id, "unique-click")).toBe(true);
      expect(game.clickPower()).toBeCloseTo(baseClick * 2);
      expect(game.equippedItemOf(character)?.id).toBe("unique-click");
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("equipment restrictions are enforced by canEquipItem and equipItem", () => {
    const testData = {
      ...makeTestData(),
      items: [
        {
          id: "uchiwa-only",
          name: "Uchiwa Eye",
          kind: "unique" as const,
          equippableBy: { tags: ["uchiwa"] },
          effects: [{ id: "u-dps", target: "teamDps" as const, kind: "percent" as const, value: 1 }],
        },
      ],
    };
    const restore = installSave(baseSave({ itemCounts: { "uchiwa-only": 1 } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      const character = testData.characters[0];
      expect(game.canEquipItem(character, "uchiwa-only")).toBe(false);
      expect(game.equipItem(character.id, "uchiwa-only")).toBe(false);
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("unequipItem removes the equipment and the bonus", () => {
    const testData = {
      ...makeTestData(),
      items: [
        {
          id: "unique-click",
          name: "Click Boost",
          kind: "unique" as const,
          effects: [{ id: "u-click", target: "clickPower" as const, kind: "multiplier" as const, value: 2 }],
        },
      ],
    };
    const restore = installSave(baseSave({ itemCounts: { "unique-click": 1 } }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      const character = testData.characters[0];
      game.equipItem(character.id, "unique-click");
      const boosted = game.clickPower();
      expect(game.unequipItem(character.id)).toBe(true);
      expect(game.clickPower()).toBeLessThan(boosted);
      expect(game.equippedItemOf(character)).toBeNull();
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("prestigeReset clears all character equipment", () => {
    const testData = {
      ...makeTestData(),
      items: [
        {
          id: "unique-dps",
          name: "DPS Boost",
          kind: "unique" as const,
          effects: [{ id: "u-dps", target: "teamDps" as const, kind: "percent" as const, value: 1 }],
        },
      ],
    };
    const restore = installSave(
      baseSave({ itemCounts: { "unique-dps": 1 }, lifetimeEarned: 10_000_000 })
    );
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      const character = testData.characters[0];
      game.equipItem(character.id, "unique-dps");
      expect(game.equippedItemOf(character)).not.toBeNull();
      game.prestigeReset();
      expect(game.equippedItemOf(character)).toBeNull();
    } finally {
      disposeRoot();
      restore();
    }
  });
});

describe("packs", () => {
  const cast: Character[] = [
    { id: "m1", name: "M1", animeId: "ta", rarity: "main", arcIds: [], baseClickPower: 10, baseDps: 10 },
    { id: "m2", name: "M2", animeId: "ta", rarity: "main", arcIds: [], baseClickPower: 10, baseDps: 10 },
    { id: "s1", name: "S1", animeId: "ta", rarity: "secondary", arcIds: [], baseClickPower: 10, baseDps: 10 },
    { id: "o1", name: "O1", animeId: "tb", rarity: "main", arcIds: [], baseClickPower: 10, baseDps: 10 },
  ];

  it("packPool keeps one world's cast at one rarity, and drawPack picks by the roll", () => {
    expect(packPool(cast, "ta", "main").map((c) => c.id)).toEqual(["m1", "m2"]);
    expect(packPool(cast, "ta", "secondary").map((c) => c.id)).toEqual(["s1"]);
    const pool = packPool(cast, "ta", "main");
    expect(drawPack(pool, 0)?.id).toBe("m1");
    expect(drawPack(pool, 0.99)?.id).toBe("m2");
    // A roll of exactly 1 must not fall off the end of the pool.
    expect(drawPack(pool, 1)?.id).toBe("m2");
    expect(drawPack([], 0.5)).toBeNull();
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
          mobs: [{ id: "ta-mob", name: "Mob", baseHp: 1, reward: 1 }],
          boss: { id: "ta-boss", name: "Boss", baseHp: 1_000_000, reward: 1 },
        },
      ],
      characters: [cast[2]],
      combos: [],
      items: [],
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      game.travelTo("ta");

      expect(game.openPack("ta", "secondary")).toBeNull(); // no points yet
      // Clicking until the pack is affordable rather than a fixed count: one click can fell several
      // 1-hp mobs once an achievement tier has lifted the click's damage (overkill carries over).
      while (game.worldPointsOf("ta") < PACK_COST.secondary) game.click();
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
    }
  });
});
