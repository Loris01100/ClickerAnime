import { describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore, CURRENCY_REWARD_MULTIPLIER, SUPPLY_KILLS_PER_COPY } from "../gameState";
import { passiveRankCost, XP_PER_KILL_REWARD } from "../growth";
import { PACK_COST } from "../packs";
import type { Enemy, ShopOffer } from "../types";
import { abilityPolicyChoices, AUSPICE_DOUBLE_DROP_CHANCE, AUTO_ABILITY_INTERVAL_MS, AUTO_ABILITY_REDUCTION_MS, AUTO_ADVANCE_DELAY_MS, AUTO_ADVANCE_REDUCTION_MS, AUTO_REMATCH_DELAY_MS, AUTO_REMATCH_REDUCTION_MS, autoAbilityIntervalMs, autoAdvanceDelayMs, AUTOCLICK_INTERVAL_MS, AUTOCLICK_INTERVAL_REDUCTION_MS, autoClickIntervalMs, autoCrossoverReserve, autoRankSlots, autoRematchDelayMs, canPurchaseNodeLevel, CRIT_CHANCE, CURRENCY_GAIN_PERCENT, DOUBLE_DROP_CHANCE, FREE_ABILITY_TRIGGER_CHANCE, FREE_PACK_CHANCE, GHOST_LOOT_CHANCE, isNodeUnlocked, LEVEL_COSTS, LEVELS_PER_BRANCH, LEVELS_PER_NODE, nodeCost, nodeLevel, nodeLevels, NARRATOR_CLICK_PERCENT, PITY_KILLS_THRESHOLD, PITY_REDUCTION_PER_LEVEL, prestigeTreeContributions, PRESTIGE_PER_KILL_CHANCE, PRESTIGE_TREE_CATEGORIES, purchaseNodeLevel, scaledChance, SHOP_COST_DISCOUNT, softenedSynergyConfig, TEAM_DPS_PERCENT, totalLevels, XP_GAIN_PERCENT } from "../prestigeTree";
import { baseSave, installSave } from "./helpers";

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
      items: opts.mobItemId ? [{ id: opts.mobItemId, name: "Item", kind: "common" as const }] : [],
      shop: opts.shop,
    };
  }


  it("Clic du Narrateur node 2 : un clic automatique à pleine puissance, à la cadence du niveau", () => {
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
      const expectedHit = game.clickPower(); // pleine puissance, pas une fraction
      vi.advanceTimersByTime(AUTOCLICK_INTERVAL_MS);
      expect(hpBefore - game.enemyHpLeft()).toBeCloseTo(expectedHit, 5);
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  });

  it("l'échelle de cadence de l'autoclic est bien 2 / 1,7 / 1,4 / 1,1 / 0,8s", () => {
    expect(autoClickIntervalMs(0)).toBe(0); // nœud non acheté
    expect([1, 2, 3, 4, 5].map(autoClickIntervalMs)).toEqual([2_000, 1_700, 1_400, 1_100, 800]);
    // La descente s'arrête au niveau max du nœud : jamais un intervalle nul ou négatif.
    expect(autoClickIntervalMs(LEVELS_PER_NODE)).toBeGreaterThan(0);
    expect(AUTOCLICK_INTERVAL_REDUCTION_MS * (LEVELS_PER_NODE - 1)).toBeLessThan(AUTOCLICK_INTERVAL_MS);
  });

  it("un niveau supérieur fait effectivement tirer plus souvent", () => {
    const testData = makeTestData({ mobBaseHp: 1_000_000 });
    vi.useFakeTimers();
    let disposeRoot!: () => void;

    /** Auto-clics tirés en une fenêtre donnée, à ce niveau de nœud. */
    const shotsIn = (level: number, windowMs: number) => {
      const restore = installSave(baseSave({ prestigeTreeRanks: { narratorClick: [1, level, 0, 0, 0] } }));
      try {
        const game = createRoot((dispose) => {
          disposeRoot = dispose;
          return createGameStore(testData);
        });
        expect(game.autoClickInterval()).toBe(autoClickIntervalMs(level));
        vi.advanceTimersByTime(windowMs);
        return game.autoClickPulse().id;
      } finally {
        disposeRoot();
        restore();
      }
    };

    try {
      // 4s : 2 tirs à 2s d'intervalle, 5 à 0,8s.
      expect(shotsIn(1, 4_000)).toBe(2);
      expect(shotsIn(5, 4_000)).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("chaque auto-clic s'annonce, pour que la scène puisse l'afficher", () => {
    const testData = makeTestData({ mobBaseHp: 1_000_000 });
    const restore = installSave(baseSave({ prestigeTreeRanks: { narratorClick: [1, 1, 0, 0, 0] } }));
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      expect(game.autoClickPulse().id).toBe(0);

      vi.advanceTimersByTime(AUTOCLICK_INTERVAL_MS);
      const first = game.autoClickPulse();
      expect(first.id).toBe(1);
      expect(first.damage).toBeCloseTo(game.clickPower(), 5);

      // The id has to move even when two hits land for exactly the same damage, or the stage's
      // effect would miss the second one and draw a single pop for two clicks.
      vi.advanceTimersByTime(AUTOCLICK_INTERVAL_MS);
      expect(game.autoClickPulse().id).toBe(2);
      expect(game.autoClickPulse().damage).toBeCloseTo(first.damage, 5);
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  });

  it("l'auto-clic peut être coupé, et le choix est sauvegardé", () => {
    const testData = makeTestData({ mobBaseHp: 1_000_000 });
    const ranks = { narratorClick: [1, 1, 0, 0, 0] };
    vi.useFakeTimers();
    let disposeRoot!: () => void;

    const restoreOff = installSave(baseSave({ prestigeTreeRanks: ranks, autoClickEnabled: false }));
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      expect(game.autoClickEnabled()).toBe(false);
      expect(game.autoClickLevel()).toBe(1); // le perk est bien acheté, il est juste débranché

      const hpBefore = game.enemyHpLeft();
      vi.advanceTimersByTime(AUTOCLICK_INTERVAL_MS * 2);
      expect(game.enemyHpLeft()).toBe(hpBefore); // aucun dégât, aucune annonce
      expect(game.autoClickPulse().id).toBe(0);

      // Et le rebranchement reprend immédiatement.
      game.setAutoClickEnabled(true);
      vi.advanceTimersByTime(AUTOCLICK_INTERVAL_MS);
      expect(game.enemyHpLeft()).toBeLessThan(hpBefore);
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restoreOff();
    }

    // Un save d'avant l'option n'a pas le champ : l'auto-clic reste actif par défaut.
    const restoreLegacy = installSave(baseSave({ prestigeTreeRanks: ranks }));
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      expect(game.autoClickEnabled()).toBe(true);
    } finally {
      disposeRoot();
      restoreLegacy();
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
      expect(game.currency()).toBeCloseTo(10 * CURRENCY_REWARD_MULTIPLIER * (1 + CURRENCY_GAIN_PERCENT));
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

  it("Destin nœud 5 : « Carte blanche » offre parfois le pack, sans en dépenser les points", () => {
    // random() = 0 : le tirage prend le premier du pool, et le jet de gratuité passe.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const testData = makeTestData();
    const restore = installSave(
      baseSave({ worldPoints: { ta: PACK_COST.secondary }, prestigeTreeRanks: { destin: [1, 1, 1, 1, 1] } })
    );
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      const draw = game.openPack("ta", "secondary");
      expect(draw?.character.id).toBe("ca");
      expect(draw?.free).toBe(true);
      // Le doublon est bien acquis, et les points sont restés en caisse.
      expect(game.duplicatesOf("ca")).toBe(1);
      expect(game.worldPointsOf("ta")).toBe(PACK_COST.secondary);
    } finally {
      disposeRoot();
      restore();
      vi.restoreAllMocks();
    }
  });

  it("Destin nœud 5 : le pack reste payant quand le jet ne passe pas, et impayable sans les points", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // au-dessus de FREE_PACK_CHANCE × 5
    const testData = makeTestData();
    const restore = installSave(
      baseSave({ worldPoints: { ta: PACK_COST.secondary }, prestigeTreeRanks: { destin: [1, 1, 1, 1, 1] } })
    );
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      expect(game.openPack("ta", "secondary")?.free).toBe(false);
      expect(game.worldPointsOf("ta")).toBe(0);
      // Le nœud n'achète jamais un tirage que le joueur n'aurait pas pu payer : plus de points, plus de pack.
      expect(game.openPack("ta", "secondary")).toBeNull();
    } finally {
      disposeRoot();
      restore();
      vi.restoreAllMocks();
    }
  });

  it("vend des lots de l'objet commun de l'arc actif au prix de son économie locale", () => {
    const testData = makeTestData({ mobItemId: "common-item", mobDropChance: 0 });
    testData.items.push({ id: "other-item", name: "Autre objet", kind: "common" });
    testData.arcs.push({
      id: "ta-arc-2",
      animeId: "ta",
      name: "Arc 2",
      order: 1,
      mobsToBoss: 1_000,
      mobs: [{ id: "ta-mob-2", name: "Mob 2", baseHp: 12, reward: 20, itemId: "other-item", dropChance: 0 }],
      boss: { id: "ta-boss-2", name: "Boss 2", baseHp: 1_000_000, reward: 2_000 },
    });
    const restore = installSave(baseSave({ currency: 10_000, clearedArcIds: ["ta-arc"] }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });
      const offers = game.shopOffers();
      expect(offers.filter((entry) => entry.arc).map((entry) => entry.arc!.id)).toContain("ta-arc-2");
      const offer = offers.find((entry) => entry.offer.arcId === "ta-arc" && entry.offer.amount === 5)!;
      expect(offer.offer.cost).toBe(Math.ceil(10 * CURRENCY_REWARD_MULTIPLIER * SUPPLY_KILLS_PER_COPY * 5));
      expect(game.buyShopOffer(offer.offer.id)).toBe(true);
      expect(game.countOf("common-item")).toBe(5);
      expect(game.currency()).toBe(10_000 - offer.cost);
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

  it("equipping a unique item boosts only its bearer's share of the stat", () => {
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
      // The x2 is scoped to the wearer: their own flat 10 doubles, the narrator's base 2 doesn't.
      expect(game.clickPower()).toBeCloseTo(baseClick + 10);
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

describe("les nœuds de chance restent des chances", () => {
  /**
   * `scaledChance` clamps `base * level` at 1, so a base at or above 1/5 turns a node advertised as
   * a chance into a guarantee at level 5 — silently, since nothing in the UI says so. That is what
   * made a maxed "Objets" branch drop 0.73 commons per kill against a printed 12%, and the old
   * "Destin" node 5 double every single prestige. Every chance constant must stay strictly under.
   */
  const CHANCE_CONSTANTS = {
    CRIT_CHANCE,
    FREE_ABILITY_TRIGGER_CHANCE,
    DOUBLE_DROP_CHANCE,
    GHOST_LOOT_CHANCE,
    PRESTIGE_PER_KILL_CHANCE,
    AUSPICE_DOUBLE_DROP_CHANCE,
    FREE_PACK_CHANCE,
  };

  it("aucune ne devient une certitude au niveau 5", () => {
    for (const [name, base] of Object.entries(CHANCE_CONSTANTS)) {
      expect(scaledChance(base, LEVELS_PER_NODE), name).toBeLessThan(1);
    }
  });

  it("le palier de pitié reste un filet de sécurité, pas une source", () => {
    // Au niveau max, le palier doit rester bien au-dessus du 1/0.12 ≈ 8 kills du tirage de base,
    // sinon la pitié devient le vrai taux de drop et la chance affichée ne veut plus rien dire.
    const floor = PITY_KILLS_THRESHOLD - PITY_REDUCTION_PER_LEVEL * (LEVELS_PER_NODE - 1);
    expect(floor).toBeGreaterThan(8);
  });
});

describe("automatisation", () => {
  /**
   * Un monde à deux arcs, pour que « Relève » ait quelque part où aller : l'arc 2 ne s'ouvre qu'une
   * fois l'arc 1 terminé, exactement comme dans le vrai contenu.
   */
  function automationData(opts: { bossHp?: number; bossTimerMs?: number } = {}) {
    const common = { id: "aa-item", name: "Parchemin", kind: "common" as const };
    // dropChance 0 : les copies d'objets ne tombent que par le save, pour que l'intendance dépense
    // un stock connu plutôt qu'un stock au hasard.
    const mob = (id: string): Enemy => ({ id, name: id, baseHp: 10, reward: 1, itemId: common.id, dropChance: 0 });
    const passive = { target: "teamDps" as const, kind: "percent" as const, value: 0.1 };
    return {
      animes: [{ id: "aa", name: "AA", unlockCost: 0 }],
      arcs: [
        {
          id: "aa-arc",
          animeId: "aa",
          name: "Arc 1",
          order: 0,
          mobsToBoss: 1,
          mobs: [
            mob("aa-mob"),
            { id: "aa-rec-1", name: "Rencontre 1", baseHp: 10, reward: 1, characterId: "cauto" },
            { id: "aa-rec-2", name: "Rencontre 2", baseHp: 10, reward: 1, characterId: "cauto2" },
          ],
          boss: {
            id: "aa-boss",
            name: "Boss",
            baseHp: opts.bossHp ?? 50,
            reward: 5,
            ...(opts.bossTimerMs ? { timerMs: opts.bossTimerMs } : {}),
          },
        },
        {
          id: "aa-arc-2",
          animeId: "aa",
          name: "Arc 2",
          order: 1,
          mobsToBoss: 1_000,
          mobs: [mob("aa-mob-2")],
          boss: { id: "aa-boss-2", name: "Boss 2", baseHp: 1_000_000, reward: 5 },
        },
      ],
      characters: [
        {
          id: "cauto",
          name: "Auto",
          animeId: "aa",
          rarity: "secondary" as const,
          arcIds: ["aa-arc"],
          baseClickPower: 1,
          baseDps: 100,
          passive,
          ability: {
            id: "ab-auto",
            name: "Souffle",
            cooldownMs: 30_000,
            durationMs: 60_000,
            effects: [{ target: "teamDps" as const, kind: "percent" as const, value: 0.5 }],
          },
        },
        {
          id: "cauto2",
          name: "Auto 2",
          animeId: "aa",
          rarity: "secondary" as const,
          arcIds: ["aa-arc"],
          baseClickPower: 1,
          baseDps: 0,
          passive,
        },
      ],
      items: [common],
    };
  }

  const automationSave = (overrides: Record<string, unknown> = {}) =>
    baseSave({
      ownedCharacterIds: ["cauto", "cauto2"],
      activeArcId: "aa-arc",
      unlockedAnimeIds: ["aa"],
      ...overrides,
    });

  /** Boots a store on that save under fake timers, runs `body`, then puts everything back. */
  function withStore(
    save: Record<string, unknown>,
    body: (game: ReturnType<typeof createGameStore>) => void,
    data = automationData()
  ) {
    const restore = installSave(save);
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      body(game);
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  }

  it("aucune cadence d'automatisation ne tombe à zéro au niveau max", () => {
    const cadences: [string, (level: number) => number, number, number][] = [
      ["Relève", autoAdvanceDelayMs, AUTO_ADVANCE_DELAY_MS, AUTO_ADVANCE_REDUCTION_MS],
      ["Réflexe", autoAbilityIntervalMs, AUTO_ABILITY_INTERVAL_MS, AUTO_ABILITY_REDUCTION_MS],
      ["Second souffle", autoRematchDelayMs, AUTO_REMATCH_DELAY_MS, AUTO_REMATCH_REDUCTION_MS],
    ];
    for (const [name, fn, base, reduction] of cadences) {
      expect(fn(0), name).toBe(0); // nœud non acheté
      expect(fn(1), name).toBe(base);
      // Même piège que scaledChance : une réduction qui mangerait toute la base ferait tirer le
      // nœud maxé à chaque tick.
      expect(fn(LEVELS_PER_NODE), name).toBeGreaterThan(0);
      expect(reduction * (LEVELS_PER_NODE - 1), name).toBeLessThan(base);
    }
  });

  it("l'intendance ouvre une place par niveau, la réserve du crossover en libère une", () => {
    expect(autoRankSlots(0)).toBe(0);
    expect([1, 2, 3, 4, 5].map(autoRankSlots)).toEqual([1, 2, 3, 4, 5]);
    // Niveau 1 : quatre activations gardées de côté ; niveau 5 : plus rien de bloqué.
    expect(autoCrossoverReserve(1, 12)).toBe(48);
    expect(autoCrossoverReserve(LEVELS_PER_NODE, 12)).toBe(0);
  });

  it("« Relève » enchaîne sur l'arc suivant après avoir terminé le sien, pas avant", () => {
    withStore(automationSave({ prestigeTreeRanks: { automation: [1, 0, 0, 0, 0] } }), (game) => {
      vi.advanceTimersByTime(2_000);
      expect(game.arcCleared(game.data.arcs[0])).toBe(true);
      // Le délai du nœud court encore : on reste sur place.
      expect(game.activeArc()?.id).toBe("aa-arc");

      vi.advanceTimersByTime(AUTO_ADVANCE_DELAY_MS);
      expect(game.activeArc()?.id).toBe("aa-arc-2");
    });
  });

  it("« Relève » ne déloge pas d'un arc déjà terminé où l'on est revenu farmer", () => {
    // Le save arrive avec l'arc 1 déjà terminé : la relève s'arme sur le kill qui termine un arc,
    // et il n'y en a plus ici — c'est ce qui protège la boucle de farm des objets communs.
    withStore(
      automationSave({ clearedArcIds: ["aa-arc"], prestigeTreeRanks: { automation: [5, 0, 0, 0, 0] } }),
      (game) => {
        vi.advanceTimersByTime(AUTO_ADVANCE_DELAY_MS * 3);
        expect(game.activeArc()?.id).toBe("aa-arc");
      }
    );
  });

  it("une automatisation coupée reste achetée mais ne joue plus", () => {
    withStore(
      automationSave({
        prestigeTreeRanks: { automation: [1, 0, 0, 0, 0] },
        automationOff: { advance: true },
      }),
      (game) => {
        expect(game.automationLevelOf("advance")).toBe(1); // le nœud est bien acheté
        expect(game.automationEnabled("advance")).toBe(false);

        vi.advanceTimersByTime(2_000 + AUTO_ADVANCE_DELAY_MS * 2);
        expect(game.arcCleared(game.data.arcs[0])).toBe(true);
        expect(game.activeArc()?.id).toBe("aa-arc"); // personne ne nous a déplacés

        // Rebranchée, elle reprend au prochain arc terminé — pas rétroactivement sur celui-ci.
        game.setAutomationEnabled("advance", true);
        expect(game.automationEnabled("advance")).toBe(true);
        vi.advanceTimersByTime(AUTO_ADVANCE_DELAY_MS * 2);
        expect(game.activeArc()?.id).toBe("aa-arc");
      }
    );
  });

  it("« Réflexe » déclenche seul les capacités prêtes", () => {
    const ranks = { automation: [1, 1, 0, 0, 0] };
    withStore(automationSave({ prestigeTreeRanks: ranks }), (game) => {
      expect(game.activeBuffs()).toEqual([]);
      vi.advanceTimersByTime(AUTO_ABILITY_INTERVAL_MS);
      expect(game.activeBuffs()).toContain("ab-auto");
    });

    // Coupé, rien ne part tout seul : la capacité reste au chaud.
    withStore(automationSave({ prestigeTreeRanks: ranks, automationOff: { ability: true } }), (game) => {
      vi.advanceTimersByTime(AUTO_ABILITY_INTERVAL_MS * 2);
      expect(game.activeBuffs()).toEqual([]);
    });
  });

  it("« Intendance » monte le passif des personnages confiés, dans la limite de ses places", () => {
    const cost = passiveRankCost(1);
    withStore(
      automationSave({
        prestigeTreeRanks: { automation: [1, 1, 1, 0, 0] },
        itemCounts: { "aa-item": cost },
        autoRankCharacterIds: ["cauto"],
      }),
      (game) => {
        expect(game.autoRankCapacity()).toBe(1);
        vi.advanceTimersByTime(1_000);
        expect(game.passiveRankOf(game.data.characters[0])).toBe(1);
        expect(game.countOf("aa-item")).toBe(0); // les copies ont bien été dépensées

        // Une place, une seule : le deuxième personnage est refusé tant que la première est prise.
        expect(game.toggleAutoRank("cauto2")).toBe(false);
        expect(game.isAutoRanked("cauto2")).toBe(false);
        expect(game.toggleAutoRank("cauto")).toBe(true); // rendu à la main
        expect(game.toggleAutoRank("cauto2")).toBe(true);
      }
    );
  });

  it("« Second souffle » ne relance pas un boss hors de portée — il laisse farmer", () => {
    // Le vrai piège du nœud : relancer un boss que l'équipe ne peut pas tomber échange le farm qui
    // la rendrait capable de le battre contre un combat qui finira pareil — et, vu de la scène, un
    // boss qui revient à pleine vie à chaque chrono ressemble à un combat qui redémarre tout seul.
    withStore(
      automationSave({ prestigeTreeRanks: { automation: [1, 1, 1, 5, 0] } }),
      (game) => {
        const arc = game.data.arcs[0];
        vi.advanceTimersByTime(2_000); // le mob tombe, le boss arrive, son chrono expire
        expect(game.hasRetreatedFromBoss(arc)).toBe(true);
        expect(game.bossOutlookOf(arc).winnable).toBe(false);

        vi.advanceTimersByTime(AUTO_REMATCH_DELAY_MS * 4);
        expect(game.hasRetreatedFromBoss(arc)).toBe(true); // toujours en retrait
        expect(game.enemy()?.id).not.toBe("aa-boss"); // on est resté sur les mobs
      },
      automationData({ bossHp: 10_000_000, bossTimerMs: 1_000 })
    );
  });

  it("« Second souffle » relance le boss dès que l'équipe peut le battre", () => {
    // 300 pv à 100 de dps : 3s de combat pour un chrono de 2s, donc un échec — jusqu'à ce que le
    // nœud « DPS Équipe » 5 rallonge le chrono du boss assez pour que la revanche soit gagnable.
    withStore(
      automationSave({
        prestigePoints: 200,
        prestigeTreeRanks: { automation: [1, 1, 1, 5, 0], teamDps: [0, 1, 1, 1, 0] },
        // « Relève » coupée : sinon l'arc tombe et on est déjà parti au suivant quand on regarde.
        automationOff: { advance: true },
      }),
      (game) => {
        const arc = game.data.arcs[0];
        vi.advanceTimersByTime(2_500);
        expect(game.hasRetreatedFromBoss(arc)).toBe(true);
        expect(game.bossOutlookOf(arc).winnable).toBe(false);

        vi.advanceTimersByTime(AUTO_REMATCH_DELAY_MS * 2);
        expect(game.enemy()?.id).not.toBe("aa-boss"); // encore hors de portée

        expect(game.purchaseTreeLevel("teamDps", 5)).toBe(true);
        expect(game.purchaseTreeLevel("teamDps", 5)).toBe(true);
        expect(game.bossOutlookOf(arc).winnable).toBe(true);

        vi.advanceTimersByTime(AUTO_REMATCH_DELAY_MS);
        expect(game.hasRetreatedFromBoss(arc)).toBe(false); // la revanche a bien été demandée
        expect(game.arcCleared(arc)).toBe(true); // et gagnée : le boss est bien revenu
      },
      automationData({ bossHp: 300, bossTimerMs: 2_000 })
    );
  });
  it("opens the Réflexe plans level by level, and never before the node is bought", () => {
    expect(abilityPolicyChoices(0)).toEqual([]);
    expect(abilityPolicyChoices(1)).toEqual(["always"]);
    expect(abilityPolicyChoices(2)).toEqual(["always", "boss"]);
    expect(abilityPolicyChoices(5)).toEqual(["always", "boss", "sync"]);
  });

});
