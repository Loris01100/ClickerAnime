import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore } from "../gameState";
import {
  isTowerBoss,
  isTowerRewardFloor,
  isTowerSquadReady,
  nextTowerPosition,
  TOWER_BOSS_TIMER_MS,
  TOWER_CYCLE_MS,
  TOWER_FLOOR_TIMER_MS,
  TOWER_MODES,
  TOWER_ROUNDS_PER_FLOOR,
  TOWER_SQUAD_SIZE,
  TOWER_START,
  TOWER_UNITS_PER_FLOOR,
  TOWER_UNITS_PER_ROUND,
  towerCycleOf,
  towerEnemy,
  towerBossHp,
  towerFloorHp,
  towerHp,
  towerOpponent,
  towerPlayableFloors,
  towerReward,
  towerRequiredDps,
  towerRewardFloors,
} from "../tower";
import type { Character } from "../types";
import { baseSave, installSave } from "./helpers";

/**
 * La Tour de l'Ascension (`docs/tower.md`). Ce qui est tenu ici, c'est la forme du barreau — 100 /
 * 100 / 10 étages, 3 manches de 5, un boss en dernier — et les quatre règles qui l'empêchent de
 * déborder sur l'équilibre du jeu : cinq personnages et pas un de plus, aucune récolte au kill, un
 * palier payé une seule fois par cycle, et une escouade qui frappe seule.
 */

/** Un monde minuscule : deux personnages possédés, l'un porte tout le DPS, l'autre rien. */
function towerWorld(dps = 1e12, clickPower = 0) {
  return {
    animes: [{ id: "ta", name: "A", unlockCost: 0 }],
    arcs: [
      {
        id: "ta-arc",
        animeId: "ta",
        name: "Arc",
        order: 0,
        mobsToBoss: 5,
        mobs: [{ id: "mob", name: "Mob", baseHp: 1e18, reward: 1 }],
        boss: { id: "boss", name: "Boss", baseHp: 1e18, reward: 1 },
      },
    ],
    characters: [
      { id: "ca", name: "A", animeId: "ta", rarity: "main" as const, arcIds: ["ta-arc"], baseClickPower: clickPower, baseDps: dps },
      { id: "cb", name: "B", animeId: "ta", rarity: "secondary" as const, arcIds: ["ta-arc"], baseClickPower: 0, baseDps: 0 },
      { id: "cc", name: "C", animeId: "ta", rarity: "secondary" as const, arcIds: ["ta-arc"], baseClickPower: 0, baseDps: 0 },
      { id: "cd", name: "D", animeId: "ta", rarity: "secondary" as const, arcIds: ["ta-arc"], baseClickPower: 0, baseDps: 0 },
      { id: "ce", name: "E", animeId: "ta", rarity: "secondary" as const, arcIds: ["ta-arc"], baseClickPower: 0, baseDps: 0 },
      { id: "cf", name: "F", animeId: "ta", rarity: "secondary" as const, arcIds: ["ta-arc"], baseClickPower: 0, baseDps: 0 },
    ],
    items: [],
  };
}

function boot(save: Record<string, unknown> = {}, world = towerWorld()) {
  const restore = installSave(
    baseSave({ ownedCharacterIds: ["ca", "cb", "cc", "cd", "ce", "cf"], ...save })
  );
  const game = createRoot((dispose) => {
    const store = createGameStore(world);
    dispose();
    return store;
  });
  return { game, restore };
}

const SQUAD = ["ca", "cb", "cc", "cd", "ce"];

describe("tower shape", () => {
  it("keeps Summoners War's ladder: 100 / 100 / 10 floors", () => {
    expect(TOWER_MODES.map((mode) => mode.floors)).toEqual([100, 100, 10]);
    // Un seul mode ouvert pour l'instant, et c'est le facile.
    expect(TOWER_MODES.filter((mode) => mode.available).map((mode) => mode.id)).toEqual(["easy"]);
  });

  it("walks three rounds of five, the last slot of the last round being the boss", () => {
    const visited = [];
    let position: ReturnType<typeof nextTowerPosition> = TOWER_START;
    while (position) {
      visited.push(position);
      position = nextTowerPosition(position);
    }
    expect(visited).toHaveLength(TOWER_UNITS_PER_FLOOR);
    expect(TOWER_UNITS_PER_FLOOR).toBe(TOWER_ROUNDS_PER_FLOOR * TOWER_UNITS_PER_ROUND);
    expect(visited.filter(isTowerBoss)).toHaveLength(1);
    expect(isTowerBoss(visited[visited.length - 1])).toBe(true);
  });

  it("pays every tenth floor in Normal, and every floor in Hell", () => {
    expect(towerRewardFloors("easy")).toHaveLength(10);
    expect(towerRewardFloors("easy")[0]).toBe(10);
    expect(isTowerRewardFloor("easy", 10)).toBe(true);
    expect(isTowerRewardFloor("easy", 11)).toBe(false);
    expect(towerRewardFloors("hell")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("never pays a floor outside its ladder", () => {
    expect(isTowerRewardFloor("easy", 0)).toBe(false);
    expect(isTowerRewardFloor("easy", 110)).toBe(false);
    expect(towerReward("easy", 11)).toEqual({ currency: 0, crystals: 0, packPoints: 0, fragments: 0 });
  });
});

describe("tower ladder", () => {
  it("climbs strictly: every floor is heavier than the one below", () => {
    for (let floor = 2; floor <= 100; floor++) {
      expect(towerFloorHp("easy", floor)).toBeGreaterThan(towerFloorHp("easy", floor - 1));
    }
  });

  it("makes the boss the heaviest fight of its floor", () => {
    const boss = towerHp("easy", 40, { round: TOWER_ROUNDS_PER_FLOOR - 1, slot: TOWER_UNITS_PER_ROUND - 1 });
    expect(boss).toBeGreaterThan(towerHp("easy", 40, { round: TOWER_ROUNDS_PER_FLOOR - 1, slot: 0 }));
    expect(towerHp("easy", 40, { round: 1, slot: 0 })).toBeGreaterThan(towerHp("easy", 40, TOWER_START));
  });

  it("draws the same opponents for everyone, every attempt", () => {
    const cast = towerWorld().characters as Character[];
    const first = towerOpponent("easy", 37, { round: 1, slot: 2 }, cast);
    expect(towerOpponent("easy", 37, { round: 1, slot: 2 }, cast)?.id).toBe(first?.id);
    // Et un boss vient du casting principal quand il y en a un.
    expect(
      towerOpponent("easy", 37, { round: TOWER_ROUNDS_PER_FLOOR - 1, slot: TOWER_UNITS_PER_ROUND - 1 }, cast)?.rarity
    ).toBe("main");
  });

  it("hands out an opponent that can neither recruit, drop nor pay", () => {
    const enemy = towerEnemy("easy", 3, TOWER_START, towerWorld().characters as Character[]);
    expect(enemy.characterId).toBeUndefined();
    expect(enemy.portalCharacterId).toBeUndefined();
    expect(enemy.itemId).toBeUndefined();
    expect(enemy.reward).toBe(0);
    // Un mob n'a que l'horloge de l'étage au-dessus de lui.
    expect(enemy.timerMs).toBeUndefined();
  });

  it("gives every floor's boss a 30 s clock, and only the boss", () => {
    const cast = towerWorld().characters as Character[];
    const bossSlot = { round: TOWER_ROUNDS_PER_FLOOR - 1, slot: TOWER_UNITS_PER_ROUND - 1 };
    expect(TOWER_BOSS_TIMER_MS).toBe(30_000);
    for (const floor of [1, 42, 100]) {
      for (const mode of ["easy", "hard", "hell"] as const) {
        expect(towerEnemy(mode, floor, bossSlot, cast).timerMs).toBe(TOWER_BOSS_TIMER_MS);
      }
    }
    let position: ReturnType<typeof nextTowerPosition> = TOWER_START;
    let timed = 0;
    while (position) {
      if (towerEnemy("easy", 7, position, cast).timerMs !== undefined) timed++;
      position = nextTowerPosition(position);
    }
    expect(timed).toBe(1);
  });

  it("prices a floor on whichever clock binds — and that is the boss's", () => {
    for (const floor of [1, 50, 100]) {
      const byFloor = towerFloorHp("easy", floor) / (TOWER_FLOOR_TIMER_MS / 1000);
      const byBoss = towerBossHp("easy", floor) / (TOWER_BOSS_TIMER_MS / 1000);
      expect(byBoss).toBeGreaterThan(byFloor);
      expect(towerRequiredDps("easy", floor)).toBeCloseTo(byBoss, 6);
    }
  });

  it("opens exactly one floor above the highest cleared", () => {
    expect(towerPlayableFloors("easy", 0)).toEqual([1]);
    expect(towerPlayableFloors("easy", 3)).toEqual([1, 2, 3, 4]);
    expect(towerPlayableFloors("easy", 100)).toHaveLength(100);
  });
});

describe("tower cycle", () => {
  it("only ever moves forward by whole cycles", () => {
    const start = 1_000_000;
    expect(towerCycleOf(start, start + TOWER_CYCLE_MS / 2).elapsed).toBe(0);
    const twoLater = towerCycleOf(start, start + TOWER_CYCLE_MS * 2.5);
    expect(twoLater.elapsed).toBe(2);
    expect(twoLater.startedAt).toBe(start + TOWER_CYCLE_MS * 2);
    // Une horloge qui recule ne rend jamais un cycle de plus.
    expect(towerCycleOf(start, start - TOWER_CYCLE_MS).elapsed).toBe(0);
  });

  it("wipes the climb and re-arms the rewards when a cycle has passed", () => {
    const { game, restore } = boot({
      towerFloors: { easy: 12 },
      towerClaimed: ["easy:10"],
      towerSquadIds: SQUAD,
      towerCycleStartedAt: Date.now() - TOWER_CYCLE_MS - 1,
    });
    try {
      expect(game.towerHighestFloorOf("easy")).toBe(0);
      expect(game.towerRewardClaimed("easy", 10)).toBe(false);
      // L'escouade, elle, est une préférence : elle traverse le cycle.
      expect(game.towerSquadIds()).toEqual(SQUAD);
    } finally {
      restore();
    }
  });
});

describe("tower squad", () => {
  it("stops at five and refuses a character the run does not own", () => {
    const { game, restore } = boot();
    try {
      for (const id of SQUAD) expect(game.toggleTowerSquadMember(id)).toBe(true);
      expect(game.toggleTowerSquadMember("cf")).toBe(false);
      expect(game.towerSquadIds()).toHaveLength(TOWER_SQUAD_SIZE);
      expect(game.towerSquadReady()).toBe(true);
      expect(game.toggleTowerSquadMember("ca")).toBe(true);
      expect(game.towerSquadReady()).toBe(false);
    } finally {
      restore();
    }
  });

  it("only counts a full squad of owned characters as ready", () => {
    expect(isTowerSquadReady(["a", "b", "c", "d", "e"], ["a", "b", "c", "d", "e"])).toBe(true);
    expect(isTowerSquadReady(["a", "a", "c", "d", "e"], ["a", "c", "d", "e"])).toBe(false);
    expect(isTowerSquadReady(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toBe(false);
    expect(isTowerSquadReady(["a", "b", "c", "d", "z"], ["a", "b", "c", "d"])).toBe(false);
  });

  it("fights with the five alone, never with the rest of the roster", () => {
    const { game, restore } = boot({ towerSquadIds: ["cb", "cc", "cd", "ce", "cf"] });
    try {
      // `ca` porte tout le DPS de l'équipe et n'est pas dans l'escouade : la tour ne frappe pas.
      expect(game.teamDps()).toBeGreaterThan(0);
      expect(game.towerSquadDps()).toBe(0);
    } finally {
      restore();
    }
  });
});

describe("tower run", () => {
  it("refuses a floor past the next uncleared one, and a mode that is not open", () => {
    const { game, restore } = boot({ towerSquadIds: SQUAD, towerFloors: { easy: 4 } });
    try {
      expect(game.enterTower("easy", 6)).toBe(false);
      expect(game.enterTower("hard", 1)).toBe(false);
      expect(game.enterTower("easy", 5)).toBe(true);
      expect(game.towerFloor()).toBe(5);
      game.leaveTower();
      expect(game.inTower()).toBe(false);
    } finally {
      restore();
    }
  });

  it("refuses to start at all without a full squad", () => {
    const { game, restore } = boot({ towerSquadIds: ["ca"] });
    try {
      expect(game.enterTower("easy", 1)).toBe(false);
      expect(game.inTower()).toBe(false);
    } finally {
      restore();
    }
  });

  it("clears a floor, banks it, pays its palier once, and moves on", () => {
    // Un clic assez fort pour traverser les quinze combats d'un étage d'un seul coup.
    const { game, restore } = boot({ towerSquadIds: SQUAD, towerFloors: { easy: 9 } }, towerWorld(0, 1e18));
    try {
      const reward = towerReward("easy", 10);
      const currencyBefore = game.currency();
      const crystalsBefore = game.crossoverCrystals();
      expect(game.enterTower("easy", 10)).toBe(true);
      game.click();
      expect(game.towerHighestFloorOf("easy")).toBe(10);
      expect(game.towerRewardClaimed("easy", 10)).toBe(true);
      expect(game.currency() - currencyBefore).toBe(reward.currency);
      expect(game.crossoverCrystals() - crystalsBefore).toBe(reward.crystals);
      // La grimpe enchaîne toute seule sur l'étage suivant, qui ne paie rien.
      expect(game.towerFloor()).toBe(11);
      const currencyAfter = game.currency();
      game.click();
      expect(game.towerHighestFloorOf("easy")).toBe(11);
      expect(game.currency()).toBe(currencyAfter);

      // Et un palier déjà réclamé ne repaie pas si on le rejoue.
      game.leaveTower();
      expect(game.enterTower("easy", 10)).toBe(true);
      const beforeReplay = game.currency();
      game.click();
      expect(game.currency()).toBe(beforeReplay);
    } finally {
      restore();
    }
  });

  it("leaves the arc's own fight exactly where it was while climbing", () => {
    const { game, restore } = boot({ towerSquadIds: SQUAD });
    try {
      const before = game.enemyHpLeft();
      expect(game.enterTower("easy", 1)).toBe(true);
      expect(game.enemyHpLeft()).toBe(before);
      expect(game.enemy()?.id).toBe("mob");
    } finally {
      restore();
    }
  });

  it("runs the floor clock from the first round, and the boss clock only on the boss", () => {
    const { game, restore } = boot({ towerSquadIds: SQUAD });
    try {
      game.enterTower("easy", 1);
      expect(game.towerTimeLeft()).toBeGreaterThan(TOWER_FLOOR_TIMER_MS - 5_000);
      // Manche 1 : pas de boss en face, donc pas de seconde horloge.
      expect(game.towerOnBoss()).toBe(false);
      expect(game.towerBossTimeLeft()).toBeNull();
      expect(game.towerEnemy()?.timerMs).toBeUndefined();
    } finally {
      restore();
    }
  });

  it("arms the boss's 30 s clock the moment he shows up", () => {
    // Un clic qui tombe les quatorze premiers combats sans emporter le boss avec eux.
    const wall = towerBossHp("easy", 1);
    const { game, restore } = boot({ towerSquadIds: SQUAD }, towerWorld(0, wall));
    try {
      game.enterTower("easy", 1);
      game.click();
      expect(game.towerOnBoss()).toBe(true);
      expect(game.towerEnemy()?.timerMs).toBe(TOWER_BOSS_TIMER_MS);
      const left = game.towerBossTimeLeft();
      expect(left).not.toBeNull();
      expect(left!).toBeGreaterThan(TOWER_BOSS_TIMER_MS - 5_000);
      expect(left!).toBeLessThanOrEqual(TOWER_BOSS_TIMER_MS);
      // Et elle est bien plus courte que celle de l'étage, qui continue de tourner à côté.
      expect(left!).toBeLessThan(game.towerTimeLeft()!);
    } finally {
      restore();
    }
  });
});
