import type { Arc, Enemy } from "../types";

export function makeArc(id: string, animeId: string, order: number, mobs: Enemy[], mobsToBoss = 3): Arc {
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

/** Boots a store from a chosen save blob; the returned function puts localStorage back. */
export function baseSave(overrides: Record<string, unknown> = {}) {
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

/** Boots a store from that save blob; the returned function puts localStorage back. */
export function installSave(save: unknown): () => void {
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
