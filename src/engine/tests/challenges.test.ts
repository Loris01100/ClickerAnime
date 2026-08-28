import { describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createGameStore } from "../gameState";
import { canRecruitUnder, challengeById, clickIsMuted, challengeContributions, challengeProgress, CHALLENGES } from "../challenges";
import { baseSave, installSave } from "./helpers";

describe("défis de run", () => {
  /** `arcCount` arcs d'un même monde, une équipe déjà là, et de quoi tester chaque règle. */
  function challengeData(arcCount = 6) {
    const item = { id: "cc-item", name: "Objet", kind: "common" as const };
    const arcs = Array.from({ length: arcCount }, (_, i) => ({
      id: `cc-arc-${i}`,
      animeId: "cc",
      name: `Arc ${i}`,
      order: i,
      mobsToBoss: 1,
      mobs: [
        // dropChance 1 : l'objet tombe à tous les coups, donc « À mains nues » se lit sans hasard.
        { id: `cc-mob-${i}`, name: "Mob", baseHp: 10, reward: 1, itemId: item.id, dropChance: 1 },
        ...(i === 0 ? [{ id: "cc-rec", name: "Recrue", baseHp: 10, reward: 1, characterId: "crec" }] : []),
      ],
      boss: { id: `cc-boss-${i}`, name: "Boss", baseHp: 10, reward: 5 },
    }));
    // Six titulaires — le plafond de « En petit comité » — plus une recrue de trop.
    const roster = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      animeId: "cc",
      rarity: "secondary" as const,
      arcIds: arcs.map((a) => a.id),
      baseClickPower: 1,
      baseDps: i === 0 ? 100 : 0,
      passive: { target: "teamDps" as const, kind: "percent" as const, value: 0.1 },
      ...(i === 0
        ? {
            ability: {
              id: "cc-ability",
              name: "Capacité",
              cooldownMs: 10_000,
              durationMs: 5_000,
              effects: [{ target: "teamDps" as const, kind: "percent" as const, value: 0.5 }],
            },
          }
        : {}),
    }));
    return {
      animes: [{ id: "cc", name: "CC", unlockCost: 0 }],
      arcs,
      characters: [
        ...roster,
        {
          id: "crec",
          name: "Recrue",
          animeId: "cc",
          rarity: "secondary" as const,
          arcIds: [arcs[0].id],
          baseClickPower: 1,
          baseDps: 5,
        },
      ],
      items: [item],
    };
  }

  const challengeSave = (overrides: Record<string, unknown> = {}) =>
    baseSave({
      ownedCharacterIds: ["c0", "c1", "c2", "c3", "c4", "c5"],
      activeArcId: "cc-arc-0",
      unlockedAnimeIds: ["cc"],
      ...overrides,
    });

  function withStore(
    save: Record<string, unknown>,
    body: (game: ReturnType<typeof createGameStore>) => void,
    data = challengeData()
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

  it("chaque défi contraint vraiment quelque chose, et paie quelque chose", () => {
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const challenge of CHALLENGES) {
      // Un « défi » sans règle serait un run normal payé pour rien.
      expect(Object.keys(challenge.rules).length, challenge.id).toBeGreaterThan(0);
      expect(challenge.goal, challenge.id).toBeGreaterThan(0);
      expect(challenge.reward.length, challenge.id).toBeGreaterThan(0);
      expect(challengeById(challenge.id)).toBe(challenge);
    }
    expect(challengeById(null)).toBeNull();
    expect(challengeById("inconnu")).toBeNull();
  });

  it("la progression compte les arcs du run et plafonne à l'objectif", () => {
    const challenge = CHALLENGES[0];
    expect(challengeProgress(challenge, 0)).toEqual({ cleared: 0, goal: challenge.goal, done: false });
    expect(challengeProgress(challenge, challenge.goal - 1).done).toBe(false);
    expect(challengeProgress(challenge, challenge.goal)).toEqual({
      cleared: challenge.goal,
      goal: challenge.goal,
      done: true,
    });
    // Au-delà, l'affichage ne part pas en « 12/10 ».
    expect(challengeProgress(challenge, challenge.goal + 5).cleared).toBe(challenge.goal);
  });

  it("seuls les défis relevés versent leur récompense", () => {
    expect(challengeContributions([])).toEqual([]);
    const mods = challengeContributions(["defi-mains-nues"]);
    const reward = challengeById("defi-mains-nues")!.reward;
    expect(mods).toHaveLength(reward.length);
    expect(mods[0].target).toBe(reward[0].target);
    expect(mods[0].value).toBeCloseTo(reward[0].value);
    // Des sourceId distincts, sinon deux effets d'un même défi s'écraseraient dans le pipeline.
    const all = challengeContributions(CHALLENGES.map((c) => c.id));
    expect(new Set(all.map((m) => m.sourceId)).size).toBe(all.length);
  });

  it("canRecruitUnder ne plafonne que sous une règle qui le demande", () => {
    expect(canRecruitUnder({}, 99)).toBe(true);
    expect(canRecruitUnder({ teamCap: 6 }, 5)).toBe(true);
    expect(canRecruitUnder({ teamCap: 6 }, 6)).toBe(false);
  });

  it("« Le Narrateur muet » : le clic n'inflige plus rien", () => {
    withStore(challengeSave({ activeChallengeId: "defi-muet" }), (game) => {
      const hpBefore = game.enemyHpLeft();
      expect(game.click()).toEqual({ damage: 0, crit: false });
      expect(game.enemyHpLeft()).toBe(hpBefore);
      // La règle ne fait pas non plus grimper l'échelle de succès des clics.
      expect(game.achievementCounts()["clicks"] ?? 0).toBe(0);
    });

    // Hors défi, le même clic mord.
    withStore(challengeSave(), (game) => {
      const hpBefore = game.enemyHpLeft();
      expect(game.click().damage).toBeGreaterThan(0);
      expect(game.enemyHpLeft()).toBeLessThan(hpBefore);
    });
  });

  it("un défi ne peut pas retirer la dernière source de dégâts du jeu", () => {
    // Le run part sans équipe : à ce moment-là le clic est le *seul* dégât du jeu, et un « muet »
    // absolu rendait son propre défi injouable — première rencontre imbattable, donc jamais de
    // premier personnage, donc plus jamais un seul dégât. Le narrateur pose le décor, puis se tait.
    expect(clickIsMuted({ noClick: true }, 0)).toBe(false);
    expect(clickIsMuted({ noClick: true }, 1)).toBe(true);
    expect(clickIsMuted({}, 0)).toBe(false);

    withStore(challengeSave({ activeChallengeId: "defi-muet", ownedCharacterIds: [] }), (game) => {
      expect(game.teamDps()).toBe(0); // rien d'autre ne frappe
      const hpBefore = game.enemyHpLeft();
      expect(game.click().damage).toBeGreaterThan(0);
      expect(game.enemyHpLeft()).toBeLessThan(hpBefore); // le run peut démarrer
    });

    // Et dès le premier personnage recruté, la règle mord.
    withStore(challengeSave({ activeChallengeId: "defi-muet", ownedCharacterIds: ["c0"] }), (game) => {
      expect(game.click()).toEqual({ damage: 0, crit: false });
    });
  });

  it("« Le Silence des héros » : plus aucune capacité ne se débloque", () => {
    withStore(challengeSave({ activeChallengeId: "defi-silence" }), (game) => {
      expect(game.unlockedAbilities()).toEqual([]);
      expect(game.activateAbility("cc-ability")).toBe(false);
      expect(game.activateReadyAbilities()).toBe(0);
    });

    withStore(challengeSave(), (game) => {
      expect(game.unlockedAbilities().map((u) => u.ability.id)).toContain("cc-ability");
    });
  });

  it("« À mains nues » : plus rien ne tombe, même à 100% de chance", () => {
    withStore(challengeSave({ activeChallengeId: "defi-mains-nues" }), (game) => {
      vi.advanceTimersByTime(2_000);
      expect(game.countOf("cc-item")).toBe(0);
    });

    withStore(challengeSave(), (game) => {
      vi.advanceTimersByTime(2_000);
      expect(game.countOf("cc-item")).toBeGreaterThan(0);
    });
  });

  it("« En petit comité » : l'équipe pleine laisse la recrue sur le carreau", () => {
    withStore(challengeSave({ activeChallengeId: "defi-comite" }), (game) => {
      expect(game.ownedCharacterIds()).toHaveLength(6); // déjà au plafond
      vi.advanceTimersByTime(3_000);
      expect(game.ownedCharacterIds()).not.toContain("crec");
    });

    withStore(challengeSave(), (game) => {
      vi.advanceTimersByTime(3_000);
      expect(game.ownedCharacterIds()).toContain("crec");
    });
  });

  it("atteindre l'objectif verse la récompense, libère la règle, et ne se rejoue pas", () => {
    const challenge = challengeById("defi-mains-nues")!;
    withStore(
      challengeSave({ activeChallengeId: challenge.id }),
      (game) => {
        // On descend un arc, on avance, jusqu'au quota : c'est exactement ce que compte l'objectif.
        for (let i = 0; i < challenge.goal; i++) {
          vi.advanceTimersByTime(2_000);
          expect(game.arcCleared(game.data.arcs[i]), `arc ${i}`).toBe(true);
          if (i < challenge.goal - 1) expect(game.stepArc(1)).toBe(true);
        }
        expect(game.completedChallengeIds()).toContain(challenge.id);
        expect(game.activeChallenge()).toBeNull(); // la contrainte est levée avec la victoire
        expect(game.countOf("cc-item")).toBeGreaterThan(0); // les objets retombent

        // Un défi relevé ne se relance pas.
        expect(game.startChallenge(challenge.id)).toBe(false);
      },
      challengeData(challenge.goal)
    );
  });

  it("la récompense d'un défi relevé entre dans le pipeline permanent", () => {
    const dpsWith = (completed: string[]) => {
      let value = 0;
      withStore(challengeSave({ completedChallengeIds: completed }), (game) => {
        value = game.teamDps();
      });
      return value;
    };
    const reward = challengeById("defi-mains-nues")!.reward[0].value;
    expect(dpsWith(["defi-mains-nues"]) / dpsWith([])).toBeCloseTo(1 + reward, 5);
  });

  it("lancer un défi réinitialise le run, et un seul tourne à la fois", () => {
    withStore(challengeSave({ clearedArcIds: ["cc-arc-0"] }), (game) => {
      expect(game.startChallenge("defi-muet")).toBe(true);
      expect(game.activeChallenge()?.id).toBe("defi-muet");
      // C'est un reset : l'équipe, les arcs terminés et le monde en cours sont repartis à zéro.
      expect(game.ownedCharacterIds()).toEqual([]);
      expect(game.arcCleared(game.data.arcs[0])).toBe(false);
      expect(game.activeArc()).toBeNull();

      expect(game.startChallenge("defi-silence")).toBe(false); // un seul à la fois
      expect(game.activeChallenge()?.id).toBe("defi-muet");

      expect(game.abandonChallenge()).toBe(true);
      expect(game.activeChallenge()).toBeNull();
      expect(game.abandonChallenge()).toBe(false); // plus rien à abandonner
      expect(game.completedChallengeIds()).toEqual([]); // abandonner ne paie rien
    });
  });
});
