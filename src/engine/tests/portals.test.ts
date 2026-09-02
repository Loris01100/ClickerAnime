import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore } from "../gameState";
import {
  PORTAL_COST,
  PORTAL_DPS_RESISTANCE,
  PORTAL_SECONDS,
  PORTAL_WEIGHT_MAX,
  PORTAL_WEIGHT_MIN,
  portalEnemy,
  portalFightHp,
  portalWeights,
} from "../crossover";
import { damageMultiplierAgainst } from "../combat";
import { gameData } from "../../data";
import type { Arc } from "../types";
import { baseSave, installSave } from "./helpers";

/**
 * Un boss ne donne plus son personnage : il faut rouvrir le combat avec des cristaux, une fois
 * l'arc terminé, et le vaincre une seconde fois. Ces tests tiennent les trois choses sur lesquelles
 * tout le système repose — le boss ne recrute pas, le portail est figé à l'ouverture, et les dégâts
 * qu'on lui a infligés survivent à une sortie comme à un rechargement.
 */

/** `ca` carries the click, `cboss` is the recruit behind the boss's portal. `dps` sizes the fight. */
function portalWorld(clickPower = 1e9, dps = 0) {
  return {
    animes: [
      { id: "ta", name: "A", unlockCost: 0 },
      { id: "tb", name: "B", unlockCost: 0 },
    ],
    arcs: [
      {
        id: "ta-arc",
        animeId: "ta",
        name: "Arc",
        order: 0,
        mobsToBoss: 1,
        mobs: [{ id: "mob", name: "Mob", baseHp: 1, reward: 1 }],
        boss: { id: "boss", name: "Boss", baseHp: 1, reward: 1, portalCharacterId: "cboss" },
      },
    ],
    characters: [
      { id: "ca", name: "A", animeId: "ta", rarity: "secondary" as const, arcIds: [], baseClickPower: clickPower, baseDps: dps },
      { id: "cb", name: "B", animeId: "tb", rarity: "secondary" as const, arcIds: [], baseClickPower: 0, baseDps: 0 },
      { id: "cboss", name: "Boss", animeId: "ta", rarity: "main" as const, arcIds: [], baseClickPower: 1, baseDps: 1 },
    ],
    items: [],
  };
}

/** A store booted on that world, with the save the test asks for. */
function boot(save: Record<string, unknown>, world = portalWorld()) {
  const restore = installSave(baseSave(save));
  const game = createRoot((dispose) => {
    const store = createGameStore(world);
    dispose();
    return store;
  });
  return { game, restore };
}

describe("boss recruits", () => {
  it("never hands a character to the boss of an arc", () => {
    for (const arc of gameData.arcs) {
      expect(arc.boss.characterId, `${arc.id} recrute directement sur son boss`).toBeUndefined();
    }
    // Et l'inverse : la recrue d'un boss existe bien, elle est simplement derrière un portail.
    const behindPortals = gameData.arcs.filter((arc) => arc.boss.portalCharacterId);
    expect(behindPortals.length).toBeGreaterThan(0);
  });

  it("keeps a portal recruit's origin arc, so their passive item and home arc are unchanged", () => {
    const arc = gameData.arcs.find((a) => a.boss.portalCharacterId)!;
    const { game, restore } = (() => {
      const restoreStorage = installSave(baseSave({}));
      const store = createRoot((dispose) => {
        const created = createGameStore(gameData);
        dispose();
        return created;
      });
      return { game: store, restore: restoreStorage };
    })();
    try {
      const character = game.characterOf(arc.boss.portalCharacterId!)!;
      // `passiveItemOf` lit l'arc d'origine : c'est là que se trouve le commun qui monte le passif.
      expect(game.passiveItemOf(character)?.id).toBe(arc.mobs.find((m) => m.itemId)?.itemId);
    } finally {
      restore();
    }
  });
});

describe("portal weights", () => {
  it("reads a boss's weight off its own arc, free of the world's hp ramp", () => {
    const arc = (id: string, mobHp: number, bossHp: number): Arc => ({
      id,
      animeId: "w",
      name: id,
      order: 0,
      mobsToBoss: 1,
      mobs: [{ id: `${id}-mob`, name: "m", baseHp: mobHp, reward: 1 }],
      boss: { id: `${id}-boss`, name: "b", baseHp: bossHp, reward: 1 },
    });
    // Deux arcs à des échelles mille fois différentes, mais le même rapport boss/mob : même poids.
    const weights = portalWeights([arc("a", 10, 100), arc("b", 10_000, 100_000), arc("c", 10, 400)]);
    expect(weights.a).toBeCloseTo(weights.b, 10);
    expect(weights.c).toBeGreaterThan(weights.a);
  });

  it("clamps every authored world inside the announced band", () => {
    for (const [arcId, weight] of Object.entries(portalWeights(gameData.arcs))) {
      expect(weight, arcId).toBeGreaterThanOrEqual(PORTAL_WEIGHT_MIN);
      expect(weight, arcId).toBeLessThanOrEqual(PORTAL_WEIGHT_MAX);
    }
  });
});

describe("portal fight", () => {
  it("is sized on the team's dps and sealed against it", () => {
    expect(portalFightHp(1_000, 1)).toBe(1_000 * PORTAL_SECONDS);
    // Le sceau ne touche que le DPS : le Clic du Narrateur passe entier, et c'est toute la
    // difficulté du combat — un portail ne se gagne pas en attendant.
    const sealed = portalEnemy({ id: "boss", name: "B", baseHp: 1, reward: 1 });
    expect(damageMultiplierAgainst(sealed, "teamDps")).toBe(PORTAL_DPS_RESISTANCE);
    expect(damageMultiplierAgainst(sealed, "click")).toBe(1);
    // Ni horloge ni butin : un portail ne paie qu'en recrue.
    expect(sealed.timerMs).toBeUndefined();
    expect(sealed.itemId).toBeUndefined();
    expect(sealed.reward).toBe(0);
  });
});

describe("portal store", () => {
  it("does not recruit the boss's character when the arc's boss falls", () => {
    const { game, restore } = boot({
      ownedCharacterIds: ["ca", "cb"],
      unlockedAnimeIds: ["ta", "tb"],
      arcKills: { "ta-arc": 1 },
    });
    try {
      game.click(); // le boss tombe et l'arc se termine
      expect(game.arcCleared(game.activeArc()!)).toBe(true);
      expect(game.ownedCharacterIds()).not.toContain("cboss");
      // La recrue apparaît alors comme un portail, au prix de sa rareté.
      const target = game.portalTargets().find((t) => t.character.id === "cboss");
      expect(target?.cost).toBe(PORTAL_COST.main);
      expect(target?.open).toBe(false);
    } finally {
      restore();
    }
  });

  it("offers no portal on an arc the run has not cleared", () => {
    const { game, restore } = boot({ ownedCharacterIds: ["ca", "cb"], unlockedAnimeIds: ["ta", "tb"] });
    try {
      expect(game.portalTargets()).toHaveLength(0);
      expect(game.openPortal("cboss")).toBe(false);
    } finally {
      restore();
    }
  });

  it("spends crystals to open, freezes the hp, and recruits when the portal falls", () => {
    const { game, restore } = boot({
      ownedCharacterIds: ["ca", "cb"],
      unlockedAnimeIds: ["ta", "tb"],
      clearedArcIds: ["ta-arc"],
      crossoverCrystals: PORTAL_COST.main,
    });
    try {
      expect(game.openPortal("cboss")).toBe(true);
      expect(game.crossoverCrystals()).toBe(0);
      // Une équipe sans DPS ne fait pas un portail gratuit : le plancher de `portalFightHp` tient.
      expect(game.portalTargets().find((t) => t.character.id === "cboss")?.maxHp).toBeGreaterThan(0);
      // Deux ouvertures pour le prix d'une, non.
      expect(game.openPortal("cboss")).toBe(false);

      expect(game.enterPortal("cboss")).toBe(true);
      expect(game.enemy()?.name).toBe("Boss");
      game.click(); // 1e9 de clic contre un portail dimensionné sur 0 DPS
      expect(game.ownedCharacterIds()).toContain("cboss");
      // Le portail est consommé, et l'écran est revenu dans l'arc.
      expect(game.portalTargets()).toHaveLength(0);
      expect(game.activePortalId()).toBeNull();
    } finally {
      restore();
    }
  });

  it("keeps the damage already dealt when the player walks out, and across a save", () => {
    // Une équipe qui a du DPS : le portail vaut 30 s de ce DPS, donc bien plus qu'un clic — c'est
    // exactement le combat en plusieurs fois pour lequel la progression est sauvegardée.
    const { game, restore } = boot(
      {
        ownedCharacterIds: ["ca", "cb"],
        unlockedAnimeIds: ["ta", "tb"],
        clearedArcIds: ["ta-arc"],
        crossoverCrystals: PORTAL_COST.main,
      },
      portalWorld(1_000, 10_000)
    );
    try {
      game.openPortal("cboss");
      const maxHp = game.portalTargets()[0].maxHp;
      expect(maxHp).toBeGreaterThan(10_000);
      game.enterPortal("cboss");
      game.click();
      game.click();
      // On sort avec le combat entamé : les PV restants doivent survivre à l'aller-retour.
      const left = game.enemyHpLeft();
      expect(left).toBeLessThan(maxHp);
      expect(game.leavePortal()).toBe(true);
      expect(game.activePortalId()).toBeNull();
      const target = game.portalTargets()[0];
      expect(target.open).toBe(true);
      expect(target.maxHp).toBe(maxHp);
      expect(target.damage).toBeGreaterThan(0);
      expect(maxHp - target.damage).toBeCloseTo(left, 6);

      // Y revenir remet le boss exactement là où il en était, jamais à pleine vie.
      expect(game.enterPortal("cboss")).toBe(true);
      expect(game.enemyHpLeft()).toBeCloseTo(left, 6);
      expect(game.enemyMaxHp()).toBe(maxHp);
      game.leavePortal();

      // Et à un rechargement : c'est la seule part d'un combat que la sauvegarde retient.
      const saved = JSON.parse(atob(game.exportSave()));
      expect(saved.portalHp.cboss).toBe(maxHp);
      expect(saved.portalDamage.cboss).toBeCloseTo(target.damage, 6);
    } finally {
      restore();
    }
  });

  it("wipes open portals on prestige, like the roster they feed", () => {
    const { game, restore } = boot({
      ownedCharacterIds: ["ca", "cb"],
      unlockedAnimeIds: ["ta", "tb"],
      clearedArcIds: ["ta-arc"],
      crossoverCrystals: PORTAL_COST.main,
    });
    try {
      game.openPortal("cboss");
      game.enterPortal("cboss");
      game.prestigeReset(false);
      expect(game.activePortalId()).toBeNull();
      expect(JSON.parse(atob(game.exportSave())).portalHp).toEqual({});
      expect(game.portalTargets()).toHaveLength(0);
    } finally {
      restore();
    }
  });
});
