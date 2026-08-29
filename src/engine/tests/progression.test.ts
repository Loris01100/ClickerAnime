import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore } from "../gameState";
import { gameData } from "../../data";
import { characterContributions, defaultSynergyConfig } from "../synergy";
import { CROSSOVER_COST } from "../crossover";
import { animeTier, arcsOfAnime, canEnterNewAnime, isAnimeAvailable, isAnimeComplete, isArcUnlocked } from "../progression";
import { timeToKillMs } from "../combat";
import { arcPowerTable, CATCH_UP, catchUpGrowth, firstPassiveDropChance, isPassiveMaxed, LEVEL_DAMAGE_STEP, levelFromXp, levelGrowth, narratorClickPower, PASSIVE_LEVEL_CAP, passiveRankCost, passiveUpgrade, XP_PER_KILL_REWARD, xpProgress, xpToReach } from "../growth";
import type { Anime, Arc, Character } from "../types";
import { makeArc, baseSave, installSave } from "./helpers";

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

describe("character growth", () => {
  it("guarantees only the remaining drops needed for the first passive lesson", () => {
    const learning = {
      hasClearedArc: true,
      passiveRanksBought: 0,
      copies: 5,
      copiesNeeded: 6,
      hasCompatiblePassive: true,
    };
    expect(firstPassiveDropChance(0.12, learning)).toBe(1);
    expect(firstPassiveDropChance(0.12, { ...learning, copies: 6 })).toBe(0.12);
    expect(firstPassiveDropChance(0.12, { ...learning, passiveRanksBought: 1 })).toBe(0.12);
    expect(firstPassiveDropChance(0.12, { ...learning, hasClearedArc: false })).toBe(0.12);
  });

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
    // A passive raises its own character's stats, never the team's: it must carry their scope.
    expect(passiveAt(main, 1)!.scope).toBe(main.id);
  });

  it("lifts an early recruit up the story's power ramp without touching their relative strength", () => {
    const table = arcPowerTable(gameData.characters);
    const first = gameData.characters.find((c) => c.arcIds[0] === gameData.arcs[0].id)!;
    const lastArc = gameData.arcs[gameData.arcs.length - 1];
    const last = gameData.characters.find((c) => c.arcIds[0] === lastArc.id)!;
    const reached = table[last.arcIds[0]];

    // Fresh out of their debut arc, nothing has changed for anyone.
    expect(catchUpGrowth(table, first, table[first.arcIds[0]])).toBe(1);
    expect(catchUpGrowth(table, last, reached)).toBe(1);

    // By the last arc, the veteran has closed most of the gap the data's ramp opened — but only
    // most of it, and two characters debuting together keep their exact ratio forever.
    const rawGap = last.baseDps / first.baseDps;
    const litGap = (last.baseDps * catchUpGrowth(table, last, reached)) /
      (first.baseDps * catchUpGrowth(table, first, reached));
    expect(litGap).toBeLessThan(rawGap / 1000);
    expect(litGap).toBeGreaterThan(1); // still behind: catching up is not overtaking
    expect(CATCH_UP).toBeLessThan(1);

    const twin = { arcIds: first.arcIds };
    expect(catchUpGrowth(table, twin, reached)).toBeCloseTo(catchUpGrowth(table, first, reached));
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

describe("narrator click", () => {
  it("grows with the number of allies, and with nothing else", () => {
    const alone = narratorClickPower(0);
    expect(narratorClickPower(3)).toBeGreaterThan(alone);
    expect(narratorClickPower(3) - narratorClickPower(2)).toBe(narratorClickPower(1) - alone);
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

describe("lisibilité de la progression", () => {
  function outlookData(
    bossHp: number,
    timerMs?: number,
    passive?: { target: "teamDps"; kind: "percent"; value: number }
  ) {
    return {
      animes: [{ id: "ta", name: "TA", unlockCost: 0 }],
      arcs: [
        {
          id: "ta-arc",
          animeId: "ta",
          name: "Arc",
          order: 0,
          mobsToBoss: 1_000,
          mobs: [{ id: "ta-mob", name: "Mob", baseHp: 1_000_000, reward: 1 }],
          boss: { id: "ta-boss", name: "Boss", baseHp: bossHp, reward: 1, ...(timerMs ? { timerMs } : {}) },
        },
      ],
      characters: [
        {
          id: "ca",
          name: "A",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: ["ta-arc"],
          baseClickPower: 0,
          baseDps: 100,
          ...(passive ? { passive } : {}),
        },
      ],
      items: [],
    };
  }

  it("timeToKillMs : le temps réel, et l'infini sans DPS", () => {
    expect(timeToKillMs(500, 100)).toBe(5_000);
    expect(timeToKillMs(500, 0)).toBe(Infinity);
  });

  it("bossOutlookOf fait passer l'équipe par tout le pipeline, pas seulement ses dégâts bruts", () => {
    // Le pronostic ne sommait que la contribution `flat` des personnages : passifs, bonus
    // d'évolution, objets équipés, succès et arbre de prestige — l'essentiel du dps d'une équipe qui
    // a grandi — n'y entraient pas. Résultat : « trop dur » sur un boss que l'équipe abat largement.
    const restore = installSave({
      ...baseSave(),
      ownedCharacterIds: ["ca"],
      unlockedAnimeIds: ["ta"],
      passiveRanks: { ca: 1 },
    });
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        // 100 de dps de base, +100 % de passif = 200 : 1000 pv tombent en 5 s, sous un chrono de 7,5 s.
        // Sans le passif le pronostic annonçait 10 s, donc « trop dur » — à tort.
        return createGameStore(outlookData(1_000, 7_500, { target: "teamDps", kind: "percent", value: 1 }));
      });
      const arc = game.data.arcs[0];
      expect(game.bossOutlookOf(arc).ttkMs).toBeCloseTo(5_000);
      expect(game.bossOutlookOf(arc).winnable).toBe(true);
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("bossOutlookOf compare le temps de mise à mort au chrono du boss", () => {
    const restore = installSave({ ...baseSave(), ownedCharacterIds: ["ca"], unlockedAnimeIds: ["ta"] });
    let disposeRoot!: () => void;
    try {
      // 1000 pv à 100 dps = 10s, sous un chrono de 30s : gagnable.
      const easy = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(outlookData(1_000, 30_000));
      });
      const arc = easy.data.arcs[0];
      expect(easy.bossOutlookOf(arc).ttkMs).toBeCloseTo(10_000);
      expect(easy.bossOutlookOf(arc).winnable).toBe(true);
      disposeRoot();

      // Même équipe, boss 100x plus gros : 1000s pour 30s de chrono — l'arc dit « trop dur ».
      const hard = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(outlookData(100_000, 30_000));
      });
      expect(hard.bossOutlookOf(hard.data.arcs[0]).winnable).toBe(false);
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("crossoverAdvised ne se déclenche que hors du monde d'origine, cristaux en poche", () => {
    const data = outlookData(1_000, 30_000);
    // Un second monde, où le personnage de "ta" subit le malus other-anime.
    data.animes.push({ id: "tb", name: "TB", unlockCost: 0 });
    data.arcs.push({ ...data.arcs[0], id: "tb-arc", animeId: "tb", name: "Arc B" });

    const restore = installSave({
      ...baseSave(),
      ownedCharacterIds: ["ca"],
      unlockedAnimeIds: ["ta", "tb"],
      crossoverCrystals: CROSSOVER_COST,
    });
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });

      game.setActiveArc("ta-arc"); // chez lui : rien à gagner
      expect(game.crossoverAdvised()).toBe(false);

      game.setActiveArc("tb-arc"); // autre monde : le malus mord, le conseil s'allume
      expect(game.crossoverAdvised()).toBe(true);

      game.activateCrossover(); // déjà actif : plus rien à conseiller
      expect(game.crossoverAdvised()).toBe(false);
    } finally {
      disposeRoot();
      restore();
    }
  });
});
