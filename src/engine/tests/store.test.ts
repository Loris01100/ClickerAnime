import { describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore, MAX_KILLS_PER_SECOND, SAVE_BACKUP_KEY, SAVE_KEY } from "../gameState";
import { gameData } from "../../data";
import { baseSave, installSave } from "./helpers";

describe("store boot", () => {
  it("repairs a corrupt primary save from the automatic backup", () => {
    const backup = baseSave({ currency: 4321, ownedCharacterIds: [] });
    const storage = new Map<string, string>([
      [SAVE_KEY, "{broken"],
      [SAVE_BACKUP_KEY, JSON.stringify(backup)],
    ]);
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore({ animes: [], arcs: [], characters: [], items: [] });
      });
      expect(game.currency()).toBe(4321);
      expect(game.recoveredFromBackup()).toBe(true);
      expect(JSON.parse(storage.get(SAVE_KEY)!)).toEqual(backup);
    } finally {
      disposeRoot();
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("rotates the current save into the backup and lets the player swap back", () => {
    const current = baseSave({ currency: 100, ownedCharacterIds: [] });
    const backup = baseSave({ currency: 50, ownedCharacterIds: [] });
    const storage = new Map<string, string>([
      [SAVE_KEY, JSON.stringify(current)],
      [SAVE_BACKUP_KEY, JSON.stringify(backup)],
    ]);
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore({ animes: [], arcs: [], characters: [], items: [] });
      });
      game.save();
      expect(JSON.parse(storage.get(SAVE_BACKUP_KEY)!).currency).toBe(100);

      storage.set(SAVE_BACKUP_KEY, JSON.stringify(backup));
      expect(game.restoreBackup()).toBe(true);
      expect(JSON.parse(storage.get(SAVE_KEY)!).currency).toBe(50);
      expect(JSON.parse(storage.get(SAVE_BACKUP_KEY)!).currency).toBe(100);
    } finally {
      disposeRoot();
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("keeps a character's passive rank through prestige and restores it on recruitment", () => {
    const data = {
      animes: [{ id: "ta", name: "A", unlockCost: 0 }],
      arcs: [{
        id: "ta-arc",
        animeId: "ta",
        name: "Arc",
        order: 0,
        mobsToBoss: 10,
        mobs: [
          { id: "hero-fight", name: "Itachi", baseHp: 1, reward: 1, characterId: "itachi" },
          { id: "plain", name: "Ninja", baseHp: 1, reward: 1 },
        ],
        boss: { id: "boss", name: "Boss", baseHp: 100, reward: 10 },
      }],
      characters: [{
        id: "itachi",
        name: "Itachi Uchiwa",
        animeId: "ta",
        rarity: "main" as const,
        arcIds: ["ta-arc"],
        baseClickPower: 1,
        baseDps: 10,
        passive: { target: "teamDps" as const, kind: "percent" as const, value: 0.2 },
      }],
      items: [],
    };
    const restore = installSave(baseSave({
      ownedCharacterIds: ["itachi"],
      passiveRanks: { itachi: 5 },
    }));

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      const itachi = data.characters[0];
      expect(game.passiveRankOf(itachi)).toBe(5);

      game.prestigeReset();
      expect(game.ownedCharacterIds()).not.toContain("itachi");
      expect(game.passiveRankOf(itachi)).toBe(5);

      expect(game.travelTo("ta")).toBe(true);
      game.click();
      expect(game.ownedCharacterIds()).toContain("itachi");
      expect(game.passiveRankOf(itachi)).toBe(5);
      expect(game.characterStatOf(itachi, "teamDps")).toBeGreaterThan(itachi.baseDps);
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("le DPS affiché par personnage additionne exactement le DPS de l'équipe", () => {
    // La panne que ce test garde : `characterStatOf` ne pliait que les modificateurs du personnage,
    // alors que `teamDps` applique en plus tout ce qui est global (succès, arbre de prestige, bonus
    // d'évolution) à *chaque* groupe. Un roster de 40 personnages à 3k affichés vivait donc sous un
    // total de 240k. Les deux nombres doivent tomber sur la même somme.
    const data = {
      animes: [
        { id: "ta", name: "A", unlockCost: 0 },
        { id: "tb", name: "B", unlockCost: 0 },
      ],
      arcs: [
        {
          id: "ta-arc", animeId: "ta", name: "Arc", order: 0, mobsToBoss: 1,
          mobs: [{ id: "mob", name: "Mob", baseHp: 1, reward: 1 }],
          boss: { id: "boss", name: "Boss", baseHp: 1, reward: 1 },
        },
      ],
      characters: [
        {
          id: "ca", name: "A", animeId: "ta", rarity: "main" as const, arcIds: ["ta-arc"],
          baseClickPower: 5, baseDps: 10,
          // Passif scopé : il ne gonfle que A.
          passive: { target: "teamDps" as const, kind: "percent" as const, value: 0.5 },
          ability: {
            id: "ability-a", name: "A", cooldownMs: 0, durationMs: 10_000,
            effects: [{ target: "teamDps" as const, kind: "multiplier" as const, value: 3 }],
          },
          // Bonus d'évolution : non scopé, il multiplie toute l'équipe.
          evolution: {
            animeId: "tb", label: "Évo",
            bonus: [{ target: "teamDps" as const, kind: "percent" as const, value: 0.25 }],
          },
        },
        {
          id: "cb", name: "B", animeId: "ta", rarity: "secondary" as const, arcIds: ["ta-arc"],
          baseClickPower: 3, baseDps: 7,
        },
      ],
      items: [],
    };
    const restore = installSave(
      baseSave({
        ownedCharacterIds: ["ca", "cb"],
        evolvedCharacterIds: ["ca"],
        passiveRanks: { ca: 3 },
        // Deux paliers de succès sur teamDps, pour que du global non nul soit en jeu.
        achievementCounts: { mobsKilled: 150, bossesKilled: 6 },
      })
    );
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      const sum = game
        .ownedCharacters()
        .reduce((total, c) => total + game.characterStatOf(c, "teamDps"), 0);
      expect(game.teamDps()).toBeGreaterThan(17); // le global mord vraiment
      expect(sum).toBeCloseTo(game.teamDps());

      // Et toujours vrai pendant qu'un buff temporaire tourne sur un seul membre.
      expect(game.activateAbility("ability-a")).toBe(true);
      const buffed = game
        .ownedCharacters()
        .reduce((total, c) => total + game.characterStatOf(c, "teamDps"), 0);
      expect(buffed).toBeGreaterThan(sum); // la capacité tourne bien
      expect(buffed).toBeCloseTo(game.teamDps());
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("shows a character's reduced damage after travelling to another anime", () => {
    const data = {
      animes: [
        { id: "ta", name: "A", unlockCost: 0 },
        { id: "tb", name: "B", unlockCost: 0 },
      ],
      arcs: [
        {
          id: "ta-arc", animeId: "ta", name: "Arc A", order: 0, mobsToBoss: 1,
          mobs: [{ id: "mob-a", name: "Mob A", baseHp: 1, reward: 1 }],
          boss: { id: "boss-a", name: "Boss A", baseHp: 1, reward: 1 },
        },
        {
          id: "tb-arc", animeId: "tb", name: "Arc B", order: 0, mobsToBoss: 1,
          mobs: [{ id: "mob-b", name: "Mob B", baseHp: 1, reward: 1 }],
          boss: { id: "boss-b", name: "Boss B", baseHp: 1, reward: 1 },
        },
      ],
      characters: [{
        id: "ca", name: "A", animeId: "ta", rarity: "secondary" as const,
        arcIds: ["ta-arc"], baseClickPower: 20, baseDps: 10,
      }],
      items: [],
    };
    const restore = installSave(baseSave({ unlockedAnimeIds: ["ta", "tb"] }));
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });

      expect(game.characterStatOf(data.characters[0], "clickPower")).toBeCloseTo(20);
      expect(game.characterStatOf(data.characters[0], "teamDps")).toBeCloseTo(10);

      expect(game.setActiveArc("tb-arc")).toBe(true);
      expect(game.synergyOf(data.characters[0])).toBeCloseTo(0.5);
      expect(game.characterStatOf(data.characters[0], "clickPower")).toBeCloseTo(10);
      expect(game.characterStatOf(data.characters[0], "teamDps")).toBeCloseTo(5);
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("turns repeat boss uniques into forge fragments", () => {
    const data = {
      animes: [{ id: "ta", name: "A", unlockCost: 0 }],
      arcs: [
        {
          id: "ta-arc", animeId: "ta", name: "Arc", order: 0, mobsToBoss: 1,
          mobs: [{ id: "mob", name: "Mob", baseHp: 1, reward: 1 }],
          boss: { id: "boss", name: "Boss", baseHp: 1, reward: 1, itemId: "unique" },
        },
      ],
      characters: [{ id: "ca", name: "A", animeId: "ta", rarity: "secondary" as const, arcIds: [], baseClickPower: 1, baseDps: 0 }],
      items: [{ id: "unique", name: "Unique", kind: "unique" as const }],
    };
    const restore = installSave(
      baseSave({ clearedArcIds: ["ta-arc"], arcKills: { "ta-arc": 50 }, itemCounts: { unique: 1 } })
    );
    try {
      const game = createRoot((dispose) => {
        const store = createGameStore(data);
        dispose();
        return store;
      });
      game.click();
      expect(game.countOf("unique")).toBe(1);
      expect(game.uniqueFragmentsOf("unique")).toBe(1);
    } finally {
      restore();
    }
  });

  it("upgrades a unique from its former rank-4 strength to rank 5", () => {
    const data = {
      animes: [{ id: "ta", name: "A", unlockCost: 0 }],
      arcs: [],
      characters: [{ id: "ca", name: "A", animeId: "ta", rarity: "secondary" as const, arcIds: [], baseClickPower: 10, baseDps: 0 }],
      items: [{
        id: "unique", name: "Unique", kind: "unique" as const,
        effects: [{ target: "clickPower" as const, kind: "multiplier" as const, value: 2 }],
      }],
    };
    const restore = installSave(
      baseSave({ itemCounts: { unique: 1 }, uniqueFragments: { unique: 25 }, uniqueUpgradeRanks: { unique: 4 } })
    );
    // Disposed in `finally` like every other store test, not the moment the store is built: the
    // displayed stat is read off `allModifiers`, and a root disposed up front freezes that memo on
    // its boot value — the equip below would never show up.
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      game.equipItem("ca", "unique");
      expect(game.characterStatOf(data.characters[0], "clickPower")).toBeCloseTo(20);
      expect(game.upgradeUnique("unique")).toBe(true);
      expect(game.uniqueUpgradeLevelOf("unique")).toBe(5);
      expect(game.uniqueFragmentsOf("unique")).toBe(0);
      expect(game.characterStatOf(data.characters[0], "clickPower")).toBeCloseTo(10 * (1 + 7 / 6));
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("keeps a unique's forge level through prestige and restores it on the next drop", () => {
    const data = {
      animes: [{ id: "ta", name: "A", unlockCost: 0 }],
      arcs: [{
        id: "ta-arc",
        animeId: "ta",
        name: "Arc",
        order: 0,
        mobsToBoss: 0,
        mobs: [{ id: "mob", name: "Mob", baseHp: 1, reward: 1 }],
        boss: { id: "boss", name: "Boss", baseHp: 1, reward: 1, itemId: "unique" },
      }],
      characters: [],
      items: [{ id: "unique", name: "Unique", kind: "unique" as const }],
    };
    const restore = installSave(baseSave({
      ownedCharacterIds: [],
      itemCounts: { unique: 1 },
      uniqueFragments: { unique: 12 },
      uniqueUpgradeRanks: { unique: 5 },
    }));

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      expect(game.uniqueUpgradeLevelOf("unique")).toBe(5);

      game.prestigeReset();
      expect(game.countOf("unique")).toBe(0);
      expect(game.uniqueFragmentsOf("unique")).toBe(0);
      expect(game.uniqueUpgradeLevelOf("unique")).toBe(5);

      expect(game.travelTo("ta")).toBe(true);
      game.click();
      expect(game.countOf("unique")).toBe(1);
      expect(game.uniqueUpgradeLevelOf("unique")).toBe(5);

      game.hardReset();
      expect(game.uniqueUpgradeLevelOf("unique")).toBe(0);
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("loads a remembered forge level while its unique is absent after prestige", () => {
    const data = {
      animes: [],
      arcs: [],
      characters: [],
      items: [{ id: "unique", name: "Unique", kind: "unique" as const }],
    };
    const restore = installSave(baseSave({
      ownedCharacterIds: [],
      activeArcId: null,
      unlockedAnimeIds: [],
      itemCounts: {},
      uniqueUpgradeRanks: { unique: 5 },
    }));
    try {
      const game = createRoot((dispose) => {
        const store = createGameStore(data);
        dispose();
        return store;
      });
      expect(game.countOf("unique")).toBe(0);
      expect(game.uniqueUpgradeLevelOf("unique")).toBe(5);
    } finally {
      restore();
    }
  });

  it("keeps ability cooldowns across a reload", () => {
    const usedAt = Date.now();
    const data = {
      animes: [{ id: "ta", name: "A", unlockCost: 0 }],
      arcs: [],
      characters: [
        {
          id: "ca",
          name: "A",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 1,
          ability: { id: "ability-a", name: "A", cooldownMs: 10_000, durationMs: 1_000, effects: [] },
        },
      ],
      items: [],
    };
    const restore = installSave({ ...baseSave(), abilityLastUsed: { "ability-a": usedAt } });
    try {
      const game = createRoot((dispose) => {
        const store = createGameStore(data);
        dispose();
        return store;
      });
      expect(game.readyAbilities()).toEqual([]);
      expect(game.abilityCooldownRemaining("ability-a")).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it("drops invalid imported equipment before it can grant a bonus", () => {
    const data = {
      animes: [{ id: "ta", name: "A", unlockCost: 0 }],
      arcs: [],
      characters: [
        { id: "ca", name: "A", animeId: "ta", rarity: "secondary" as const, arcIds: [], baseClickPower: 0, baseDps: 10 },
      ],
      items: [
        {
          id: "locked-unique",
          name: "Objet réservé",
          kind: "unique" as const,
          effects: [{ target: "teamDps" as const, kind: "flat" as const, value: 100 }],
          equippableBy: { tags: ["sage"] },
        },
      ],
    };
    const restore = installSave({ ...baseSave(), itemCounts: { "locked-unique": 1 }, characterEquipment: { ca: "locked-unique" } });
    try {
      const game = createRoot((dispose) => {
        const store = createGameStore(data);
        dispose();
        return store;
      });
      expect(game.equippedItemOf(data.characters[0])).toBeNull();
      expect(game.teamDps()).toBe(10);
    } finally {
      restore();
    }
  });

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

  it("refuses a passive rank on a character who has no passive", () => {
    // Naruto is met in the same arc as Kakashi, so the arc's common lists him next to the others —
    // but his kit is an ability and an evolution, he has no `passive`. Ranking one up would burn
    // the copies for a bonus `characterContributions` never reads.
    const restore = installSave({
      currency: 0,
      lifetimeEarned: 0,
      ownedCharacterIds: ["naruto-uzumaki", "kakashi-hatake"],
      activeArcId: "naruto-vagues",
      prestigePoints: 0,
      unlockedAnimeIds: ["naruto"],
      arcKills: {},
      clearedArcIds: [],
      characterXp: {},
      itemCounts: { "item-shuriken": 999 },
      passiveRanks: {},
      evolvedCharacterIds: [],
      achievementCounts: {},
      prestigeTreeRanks: {},
    });
    try {
      const game = createRoot((dispose) => {
        const store = createGameStore(gameData);
        dispose();
        return store;
      });
      const naruto = game.ownedCharacters().find((c) => c.id === "naruto-uzumaki")!;
      const kakashi = game.ownedCharacters().find((c) => c.id === "kakashi-hatake")!;
      expect(naruto.passive).toBeUndefined();
      expect(game.rankUpPassive(naruto)).toBe(false);
      expect(game.passiveRankOf(naruto)).toBe(0);
      expect(game.countOf("item-shuriken")).toBe(999);
      // …while the same item still ranks up someone who does have one.
      expect(game.rankUpPassive(kakashi)).toBe(true);
    } finally {
      restore();
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
      // ...and the kill budget stops it well before the raw damage would: 1001 damage on 1-hp mobs
      // is a thousand potential kills, and one hit may never resolve more than a second's worth.
      expect(game.killsIn(arc)).toBeLessThanOrEqual(MAX_KILLS_PER_SECOND);
      expect(game.enemy()).not.toBeNull();
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("une capacité ne booste que ses propres personnages, et toutes tournent en même temps", () => {
    const ability = (id: string, kind: "percent" | "multiplier", value: number) => ({
      id,
      name: id,
      cooldownMs: 0,
      durationMs: 10_000,
      effects: [
        { target: "teamDps" as const, kind, value },
        { target: "clickPower" as const, kind, value },
      ],
    });
    const member = (id: string, own: ReturnType<typeof ability>) => ({
      id,
      name: id,
      animeId: "ta",
      rarity: "secondary" as const,
      arcIds: [],
      baseClickPower: 10,
      baseDps: 10,
      ability: own,
    });
    const testData = {
      animes: [],
      arcs: [],
      characters: [
        member("ca", ability("ability-a", "percent", 1)),
        member("cb", ability("ability-b", "percent", 2)),
        member("cc", ability("ability-c", "multiplier", 2)),
      ],
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

      expect(game.teamDps()).toBe(30); // 10 + 10 + 10, no buff yet
      // Nothing blocks anything any more: the whole bar is firable, which is what "Tout lancer" does.
      expect(game.readyAbilities().length).toBe(3);
      // A's buff lands on A alone: 10 * (1 + 1) + 10 + 10.
      expect(game.activateAbility("ability-a")).toBe(true);
      expect(game.teamDps()).toBeCloseTo(40);
      expect(game.characterStatOf(testData.characters[0], "teamDps")).toBeCloseTo(20);
      expect(game.characterStatOf(testData.characters[0], "clickPower")).toBeCloseTo(20);
      expect(game.characterStatOf(testData.characters[1], "teamDps")).toBeCloseTo(10);
      expect(game.characterStatOf(testData.characters[1], "clickPower")).toBeCloseTo(10);
      // B's buff targets the same stat and still fires — it only boosts B: 20 + 10 * (1 + 2) + 10.
      expect(game.activateAbility("ability-b")).toBe(true);
      expect(game.teamDps()).toBeCloseTo(60);
      // And C's multiplier lands on C alone, on top of the two already running: 20 + 30 + 10 * 2.
      expect(game.activateAbility("ability-c")).toBe(true);
      expect(game.teamDps()).toBeCloseTo(70);
      expect(game.activeBuffs().sort()).toEqual(["ability-a", "ability-b", "ability-c"]);
    } finally {
      disposeRoot();
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });

  it("une capacité ne suit pas son personnage hors de son monde, même déjà lancée", () => {
    const arc = (animeId: string) => ({
      id: `${animeId}-arc`,
      animeId,
      name: "Arc",
      order: 0,
      mobsToBoss: 1_000,
      mobs: [{ id: `${animeId}-mob`, name: "Mob", baseHp: 1e12, reward: 1 }],
      boss: { id: `${animeId}-boss`, name: "Boss", baseHp: 1e12, reward: 1 },
    });
    const testData = {
      animes: [
        { id: "ta", name: "TA", unlockCost: 0 },
        { id: "tb", name: "TB", unlockCost: 0 },
      ],
      arcs: [arc("ta"), arc("tb")],
      characters: [
        {
          id: "ca",
          name: "CA",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: ["ta-arc"],
          baseClickPower: 0,
          baseDps: 100,
          ability: {
            id: "ability-a",
            name: "A",
            cooldownMs: 0,
            durationMs: 10_000,
            effects: [{ target: "teamDps" as const, kind: "multiplier" as const, value: 2 }],
          },
        },
      ],
      items: [],
    };
    const restore = installSave(
      baseSave({ ownedCharacterIds: ["ca"], unlockedAnimeIds: ["ta", "tb"], activeArcId: "ta-arc" })
    );
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(testData);
      });

      // Chez lui : la capacité est là et son buff porte.
      expect(game.unlockedAbilities().map((u) => u.ability.id)).toEqual(["ability-a"]);
      expect(game.teamDps()).toBeCloseTo(100);
      expect(game.activateAbility("ability-a")).toBe(true);
      expect(game.teamDps()).toBeCloseTo(200);

      // À l'étranger : plus de capacité à lancer, et le buff déjà en cours ne voyage pas non plus.
      // Reste le seul malus de synergie sur ses dégâts : 100 * 0.5.
      game.setActiveArc("tb-arc");
      expect(game.unlockedAbilities()).toEqual([]);
      expect(game.sleepingAbilityCount()).toBe(1);
      expect(game.activateAbility("ability-a")).toBe(false);
      expect(game.teamDps()).toBeCloseTo(50);

      // Et de retour chez lui, le buff toujours en cours reprend : rien n'a été consommé.
      game.setActiveArc("ta-arc");
      expect(game.teamDps()).toBeCloseTo(200);
    } finally {
      disposeRoot();
      restore();
    }
  });

  it("the free ability trigger adds to the running buffs instead of cutting one short", () => {
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
          ability: ability("ability-strong", 2),
        },
        {
          id: "cb",
          name: "B",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: [],
          baseClickPower: 0,
          baseDps: 5,
          ability: ability("ability-weak", 1),
        },
      ],
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
      expect(game.teamDps()).toBeCloseTo(35); // 10 * (1 + 2) + 5
      // The proc fires on this click. The only candidate left is the weak one, and it lands on B —
      // A's x3 is untouched: 30 + 5 * (1 + 1).
      game.click();
      expect(game.teamDps()).toBeCloseTo(40);
      expect(game.activeBuffs().sort()).toEqual(["ability-strong", "ability-weak"]);
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
        return createGameStore({ animes: [], arcs: [], characters: [], items: [] });
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

  it("does not overwrite an imported save with the old run during reload cleanup", () => {
    const imported = {
      version: 10,
      currency: 12_345,
      lifetimeEarned: 98_765,
      ownedCharacterIds: ["naruto-uzumaki", "rock-lee"],
      activeArcId: "shippuden-kazekage",
      prestigePoints: 17,
      unlockedAnimeIds: ["naruto", "shippuden"],
      arcKills: { "shippuden-kazekage": 23 },
      clearedArcIds: ["naruto-vagues", "naruto-chunin"],
      characterXp: { "naruto-uzumaki": 4_200 },
      itemCounts: { "item-fil": 8 },
      passiveRanks: { "rock-lee": 3 },
      evolvedCharacterIds: ["naruto-uzumaki"],
      achievementCounts: { kills: 321 },
      prestigeTreeRanks: { xp: [1, 2, 0, 0, 0] },
      crossoverCrystals: 4,
      worldPoints: { naruto: 6 },
      characterDuplicates: { "naruto-uzumaki": 2 },
      autoClickEnabled: false,
      automationOff: { ability: true },
      autoRankCharacterIds: ["rock-lee"],
      abilityPolicy: { "ability-portes": "boss" as const },
      abilityLastUsed: { "ability-portes": 123_000 },
      uniqueFragments: { "item-fil": 5 },
      uniqueUpgradeRanks: { "item-fil": 2 },
      activeChallengeId: null,
      completedChallengeIds: ["challenge-a"],
      characterEquipment: {},
    };
    let stored: string | null = null;
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
      removeItem: () => { stored = null; },
    };

    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore({ animes: [], arcs: [], characters: [], items: [] });
      });
      expect(game.importSave(btoa(JSON.stringify(imported)))).toBe(true);

      // `pagehide` and onCleanup both take this path while location.reload() tears the page down.
      game.save();
      disposeRoot();
      expect(JSON.parse(stored!)).toEqual(imported);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});

describe("tick delta clamp et notices du HUD", () => {
  /** `dps` at 0 freezes combat between clicks, so a test can advance timers without new kills. */
  function sleepData(dps = 1) {
    return {
      animes: [{ id: "ta", name: "TA", unlockCost: 0 }],
      arcs: [
        {
          id: "ta-arc",
          animeId: "ta",
          name: "Arc",
          order: 0,
          mobsToBoss: 1,
          mobs: [{ id: "ta-mob", name: "Mob", baseHp: 1, reward: 10, itemId: "ta-item", dropChance: 1 }],
          boss: { id: "ta-boss", name: "Boss", baseHp: 1, reward: 100, characterId: "cb" },
        },
      ],
      characters: [
        {
          id: "cb",
          name: "B",
          animeId: "ta",
          rarity: "secondary" as const,
          arcIds: ["ta-arc"],
          baseClickPower: 0,
          // 1 dps against 1-hp mobs: one second of tick time = one kill, so the clamp is countable.
          baseDps: dps,
        },
      ],
      items: [{ id: "ta-item", name: "Item", kind: "common" as const }],
    };
  }

  it("un tick après une longue veille ne banque pas des heures de dégâts", () => {
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(sleepData());
      });
      game.travelTo("ta");
      game.click(); // kills the single mob standing before the boss
      game.click(); // kills the boss, recruiting cb (1 dps) and clearing the arc
      expect(game.ownedCharacterIds()).toContain("cb");
      const before = game.lifetimeEarned();

      // One hour of wall clock passing between two ticks: `setInterval` fires once on the way back.
      vi.setSystemTime(Date.now() + 3_600_000);
      vi.advanceTimersByTime(200);

      // Without the clamp this tick would have carried 3600s of dps — i.e. MAX_KILLS_PER_HIT kills.
      const kills = (game.lifetimeEarned() - before) / 10;
      expect(kills).toBeLessThanOrEqual(5);
    } finally {
      disposeRoot();
      vi.useRealTimers();
    }
  });

  it("un drop, une recrue et un arc terminé poussent chacun une notice, expirée par le tick", () => {
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(sleepData(0));
      });
      game.travelTo("ta");
      game.click(); // mob down: guaranteed drop
      expect(game.notices().map((n) => n.kind)).toEqual(["item"]);

      game.click(); // boss down: recruits cb and clears the arc
      expect(game.notices().map((n) => n.kind)).toEqual(["item", "recruit", "arc"]);

      game.dismissNotice(game.notices()[0].id);
      expect(game.notices().map((n) => n.kind)).toEqual(["recruit", "arc"]);

      // Expiry is the tick's job, not a per-notice timer.
      vi.advanceTimersByTime(5_000);
      expect(game.notices()).toEqual([]);
    } finally {
      disposeRoot();
      vi.useRealTimers();
    }
  });

  it("regroupe les notices identiques et prolonge leur durée", () => {
    vi.useFakeTimers();
    let disposeRoot!: () => void;
    try {
      const data = sleepData(0);
      data.arcs[0].mobsToBoss = 3;
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(data);
      });
      game.travelTo("ta");
      game.click();
      vi.advanceTimersByTime(1_000);
      game.click();
      game.click();

      expect(game.notices()).toHaveLength(1);
      expect(game.notices()[0]).toMatchObject({ kind: "item", text: "Item +1", count: 3 });
      vi.advanceTimersByTime(3_200);
      expect(game.notices()).toHaveLength(1);
      vi.advanceTimersByTime(1_000);
      expect(game.notices()).toEqual([]);
    } finally {
      disposeRoot();
      vi.useRealTimers();
    }
  });
});

/**
 * The pause has to stop the click whole, not just its damage. `dealDamage` always refused while
 * paused, but everything around it in `resolveClick` kept running: the "clicks" achievement ladder
 * (a permanent clickPower bonus that survives prestige), the node-4 cooldown shave, the node-5 free
 * ability. And because `togglePause` shifts every deadline forward by the length of the pause, none
 * of it cost any time — 500 clicks on a paused game took a 45s cooldown to zero for free.
 */
describe("pause", () => {
  it("le clic ne produit plus rien tant que le jeu est en pause", () => {
    const restore = installSave(
      baseSave({
        ownedCharacterIds: gameData.characters.filter((c) => c.animeId === "naruto" && c.ability).slice(0, 3).map((c) => c.id),
        activeArcId: gameData.arcs.find((a) => a.animeId === "naruto")!.id,
        unlockedAnimeIds: ["naruto"],
        // "Clic du Narrateur" node 4 at full level: the cooldown shave that used to run while paused.
        prestigeTreeRanks: { narratorClick: [1, 1, 1, 5, 0] },
      })
    );
    let disposeRoot!: () => void;
    try {
      const game = createRoot((dispose) => {
        disposeRoot = dispose;
        return createGameStore(gameData);
      });
      const ability = game.unlockedAbilities()[0].ability.id;
      game.activateAbility(ability);
      const cooldownAtPause = game.abilityCooldownRemaining(ability);
      expect(cooldownAtPause).toBeGreaterThan(1_000);

      game.togglePause();
      const clicks = game.achievementCounts().clicks ?? 0;
      const hp = game.enemyHpLeft();
      for (let i = 0; i < 500; i++) expect(game.click()).toEqual({ damage: 0, crit: false });

      expect(game.achievementCounts().clicks ?? 0).toBe(clicks);
      expect(game.abilityCooldownRemaining(ability)).toBe(cooldownAtPause);
      expect(game.enemyHpLeft()).toBe(hp);
    } finally {
      disposeRoot();
      restore();
    }
  });
});
