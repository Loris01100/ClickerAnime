import type { ActiveModifier } from "./types";

export interface AchievementCategory {
  id: string;
  label: string;
  /** thresholds to reach, one per tier, strictly increasing */
  tiers: number[];
}

/**
 * Five countable actions, each with its own ladder of tiers. Counts are lifetime totals tracked in
 * gameState (bumped on the event, e.g. an item pickup — never derived from a stack that can later be
 * spent) and, unlike almost everything else, survive `prestigeReset`: a tier earned once keeps paying
 * its click bonus forever, the same way prestige points themselves are never wiped.
 */
export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  { id: "mobsKilled", label: "Ennemis vaincus", tiers: [25, 100, 500, 2_000, 10_000, 50_000] },
  { id: "bossesKilled", label: "Boss vaincus", tiers: [1, 5, 15, 40, 100, 250] },
  { id: "charactersRecruited", label: "Personnages recrutés", tiers: [1, 5, 15, 30, 60, 100] },
  { id: "commonItemsCollected", label: "Objets communs récoltés", tiers: [20, 100, 500, 2_500, 12_000, 60_000] },
  { id: "abilitiesUsed", label: "Capacités activées", tiers: [10, 50, 250, 1_000, 5_000, 25_000] },
];

const BASE_BONUS = 0.02;
const BONUS_GROWTH = 1.6;

/** Click-power bonus a tier is worth, growing geometrically: early tiers are a taste, late ones matter. */
export function achievementTierBonus(tierIndex: number): number {
  return BASE_BONUS * BONUS_GROWTH ** tierIndex;
}

/** How many tiers of this category are done at this count. */
export function achievementTiersCompleted(category: AchievementCategory, count: number): number {
  let completed = 0;
  for (const threshold of category.tiers) {
    if (count < threshold) break;
    completed++;
  }
  return completed;
}

/** The next threshold still to reach, or null once every tier of the category is done. */
export function achievementNextThreshold(category: AchievementCategory, count: number): number | null {
  return category.tiers.find((threshold) => count < threshold) ?? null;
}

/** One permanent `clickPower` percent modifier per completed tier, folded into `allModifiers` like anything else. */
export function achievementContributions(counts: Record<string, number>): ActiveModifier[] {
  return ACHIEVEMENT_CATEGORIES.flatMap((category) => {
    const completed = achievementTiersCompleted(category, counts[category.id] ?? 0);
    return Array.from({ length: completed }, (_, tier) => ({
      sourceId: `achievement:${category.id}:${tier}`,
      target: "clickPower" as const,
      kind: "percent" as const,
      value: achievementTierBonus(tier),
    }));
  });
}
