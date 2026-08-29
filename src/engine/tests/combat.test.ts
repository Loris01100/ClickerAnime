import { describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore, MAX_KILLS_PER_SECOND } from "../gameState";
import { BOSS_REPLAY_KILLS, damageMultiplierAgainst, encounterPool, enemyHp, killRateOf, nextEnemy, pendingRecruits } from "../combat";
import type { Enemy } from "../types";
import { makeArc, baseSave, installSave } from "./helpers";

describe("combat", () => {
  const mob: Enemy = { id: "mob", name: "Mob", baseHp: 10, reward: 4 };
  const rival: Enemy = { id: "rival", name: "Rival", baseHp: 40, reward: 20, characterId: "c1" };
  const arc = makeArc("a1", "a", 0, [mob, rival], 3);

  it("scales hp with the world difficulty", () => {
    expect(enemyHp(mob, 1)).toBe(10);
    expect(enemyHp(mob, 2.5)).toBe(25);
  });

  it("applies experimental boss traits only to their advertised source", () => {
    const mist: Enemy = {
      ...mob,
      bossTrait: {
        kind: "click-resistance",
        name: "Brume",
        description: "Clic réduit",
        multiplier: 0.5,
      },
    };
    const guard: Enemy = {
      ...mob,
      bossTrait: {
        kind: "dps-resistance",
        name: "Garde",
        description: "DPS réduit",
        multiplier: 0.75,
      },
    };
    const shield: Enemy = {
      ...mob,
      bossTrait: { kind: "shield", name: "Bouclier", description: "PV augmentés", multiplier: 0.2 },
    };

    expect(damageMultiplierAgainst(mist, "click")).toBe(0.5);
    expect(damageMultiplierAgainst(mist, "teamDps")).toBe(1);
    expect(damageMultiplierAgainst(guard, "teamDps")).toBe(0.75);
    expect(damageMultiplierAgainst(guard, "click")).toBe(1);
    expect(enemyHp(shield, 2)).toBe(24);
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

  it("brings a cleared arc's boss back every 50 mob victories", () => {
    expect(nextEnemy(arc, BOSS_REPLAY_KILLS - 1, ["c1"], true).id).toBe("mob");
    expect(nextEnemy(arc, BOSS_REPLAY_KILLS, ["c1"], true).id).toBe("a1-boss");
    expect(nextEnemy(arc, BOSS_REPLAY_KILLS, ["c1"], true, true).id).toBe("mob");
  });

  it("farms mobs instead of the boss once the player retreated from it", () => {
    expect(nextEnemy(arc, 3, [], false, true).id).not.toBe("a1-boss");
    expect(nextEnemy(arc, 3, [], false, false).id).toBe("a1-boss");
  });
});

/**
 * Overkill carry-over makes the kill rate `dps / mob hp`, and a cleared arc's mobs never grow:
 * coming back to farm an old zone — which the passive-item design asks for — used to resolve
 * hundreds of fights a second, and every per-kill reward rode on it (drops, monnaie, xp, points
 * de pack). This is the one thing bounding that.
 */
const farmData = (dps: number) => ({
  animes: [{ id: "ta", name: "TA", unlockCost: 0 }],
  arcs: [
    {
      id: "ta-arc",
      animeId: "ta",
      name: "Arc",
      order: 0,
      mobsToBoss: 1_000_000,
      mobs: [{ id: "ta-mob", name: "Mob", baseHp: 1, reward: 1, itemId: "ta-item", dropChance: 1 }],
      boss: { id: "ta-boss", name: "Boss", baseHp: 1e12, reward: 1 },
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
      baseDps: dps,
    },
  ],
  items: [{ id: "ta-item", name: "Item", kind: "common" as const }],
});


describe("plafond de kills par seconde", () => {
  it("un DPS absurde ne dépasse pas le budget de kills, et les drops suivent", () => {
    const restore = installSave({ ...baseSave(), ownedCharacterIds: ["ca"], unlockedAnimeIds: ["ta"] });
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      // A billion dps against 1-hp mobs: uncapped, each of the ten ticks below would resolve
      // MAX_KILLS_PER_HIT (100) kills — a thousand fights and a thousand guaranteed drops.
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(farmData(1e9));
      });
      game.setActiveArc("ta-arc");

      vi.advanceTimersByTime(2_000);

      const arc = game.activeArc()!;
      // Two seconds of refill on top of the full budget the store starts with.
      expect(game.killsIn(arc)).toBeLessThanOrEqual(MAX_KILLS_PER_SECOND * 3);
      expect(game.killsIn(arc)).toBeGreaterThan(MAX_KILLS_PER_SECOND); // et ça avance quand même
      // dropChance 1: the common count is the kill count, which is the whole point of the cap.
      expect(game.countOf("ta-item")).toBe(game.killsIn(arc));
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  });

  it("ne ralentit jamais un boss : un seul ennemi, un seul kill", () => {
    const data = farmData(5_000);
    data.arcs[0].mobsToBoss = 0;
    data.arcs[0].boss = { id: "ta-boss", name: "Boss", baseHp: 1_000, reward: 1 };
    const restore = installSave({
      ...baseSave(),
      ownedCharacterIds: ["ca"],
      unlockedAnimeIds: ["ta"],
      arcKills: { "ta-arc": 7 },
    });
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      game.setActiveArc("ta-arc");
      vi.advanceTimersByTime(200); // un seul tick
      expect(game.arcCleared(game.data.arcs[0])).toBe(true);
      expect(game.killsIn(game.data.arcs[0])).toBe(0);
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  });

  /**
   * Le trou que le plafond avait : `dealDamage` accordait un kill garanti **par appel**, et le tick,
   * l'autoclic et chaque clic manuel sont des appels distincts. Le taux réel était donc
   * `MAX_KILLS_PER_SECOND` + la cadence de clic — 20 kills/s mesurés à 20 clics/s — et tout ce qui
   * se gagne par kill suivait. Le budget partait aussi en négatif sans plancher, donc le burst
   * d'overkill ne se déclenchait plus jamais après quelques minutes.
   *
   * Cliquer plus vite doit gagner du temps sur un ennemi qu'on n'abat pas encore d'un coup, jamais
   * lever le plafond : ici les mobs ont 1 PV, donc rien n'est laissé au clic que le plafond.
   */
  it("cliquer comme un forcené ne desserre pas le plafond", () => {
    const restore = installSave({ ...baseSave(), ownedCharacterIds: ["ca"], unlockedAnimeIds: ["ta"] });
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      // 0 dps : tous les kills viennent des clics, donc on mesure le plafond et rien d'autre.
      const data = farmData(0);
      data.characters[0].baseClickPower = 1e9;
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      game.setActiveArc("ta-arc");

      const seconds = 10;
      for (let tick = 0; tick < seconds * 5; tick++) {
        for (let click = 0; click < 8; click++) game.click(); // 40 clics/s
        vi.advanceTimersByTime(200);
      }

      const arc = game.activeArc()!;
      // Le budget plein du départ en plus des dix secondes de recharge, et pas un kill de plus.
      expect(game.killsIn(arc)).toBeLessThanOrEqual(MAX_KILLS_PER_SECOND * (seconds + 1));
      expect(game.killsIn(arc)).toBeGreaterThan(MAX_KILLS_PER_SECOND * (seconds - 1));
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  });
});

describe("cadence de kills affichée", () => {
  /**
   * Ce que le joueur ne pouvait pas voir : « DPS équipe » ne dit rien du plafond, donc sur un arc
   * dépassé on continuait à empiler des dégâts qui ne rapportaient plus un objet de plus.
   */
  it("mesure la cadence et ce que le plafond jette", () => {
    // 100 dps contre des mobs à 50 PV : 2 combats/s, sous le plafond — rien n'est perdu.
    expect(killRateOf(50, 100, MAX_KILLS_PER_SECOND)).toEqual({ uncapped: 2, actual: 2, efficiency: 1 });
    // 1000 dps contre les mêmes mobs : 20 combats/s voulus, 5 accordés, trois quarts jetés.
    const capped = killRateOf(50, 1_000, MAX_KILLS_PER_SECOND);
    expect(capped.uncapped).toBe(20);
    expect(capped.actual).toBe(MAX_KILLS_PER_SECOND);
    expect(capped.efficiency).toBeCloseTo(0.25);
  });

  it("ne divise jamais par zéro : sans dégâts ni PV, la cadence est nulle et rien n'est perdu", () => {
    expect(killRateOf(50, 0, MAX_KILLS_PER_SECOND)).toEqual({ uncapped: 0, actual: 0, efficiency: 1 });
    expect(killRateOf(0, 100, MAX_KILLS_PER_SECOND)).toEqual({ uncapped: 0, actual: 0, efficiency: 1 });
  });

  /**
   * Le boss est le seul combat où la cadence ment : un ennemi, un kill, donc le plafond n'a rien à
   * mordre. Le store rend `null` plutôt que de laisser l'écran annoncer un DPS « perdu » qui ne
   * l'est pas.
   */
  it("le store ne publie pas de cadence sur un boss", () => {
    const data = farmData(5_000);
    data.arcs[0].mobsToBoss = 3;
    data.arcs[0].boss = { id: "ta-boss", name: "Boss", baseHp: 1e9, reward: 1 };
    const restore = installSave({
      ...baseSave(),
      ownedCharacterIds: ["ca"],
      unlockedAnimeIds: ["ta"],
      arcKills: { "ta-arc": 3 },
    });
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      game.setActiveArc("ta-arc");
      expect(game.enemy()!.id).toBe("ta-boss");
      expect(game.killRate()).toBeNull();
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  });

  it("le store publie la cadence saturée d'un farm dépassé", () => {
    // Mobs à 1 PV, un milliard de dps : le plafond est très largement atteint.
    const restore = installSave({ ...baseSave(), ownedCharacterIds: ["ca"], unlockedAnimeIds: ["ta"] });
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(farmData(1e9));
      });
      game.setActiveArc("ta-arc");
      const rate = game.killRate()!;
      expect(rate.actual).toBe(MAX_KILLS_PER_SECOND);
      expect(rate.uncapped).toBeGreaterThan(MAX_KILLS_PER_SECOND);
      expect(rate.efficiency).toBeLessThan(0.001);
    } finally {
      disposeRoot();
      vi.useRealTimers();
      restore();
    }
  });
});
