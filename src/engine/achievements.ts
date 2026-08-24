import type { ActiveModifier, ModifierTarget } from "./types";

export interface AchievementCategory {
  id: string;
  label: string;
  /** Which stat this ladder's tiers pay into — see ACHIEVEMENT_CATEGORIES. */
  target: ModifierTarget;
  /** thresholds to reach, one per tier, strictly increasing */
  tiers: number[];
}

/**
 * One ladder per countable action. Counts are lifetime totals tracked in gameState (bumped on the
 * event, e.g. an item pickup — never derived from a stack that can later be spent) and, unlike
 * almost everything else, survive `prestigeReset`: a tier earned once keeps paying forever, the
 * same way prestige points themselves are never wiped.
 *
 * Each category names its own `target`, because the click is a trigger and not a damage source:
 * paying thirteen ladders into `clickPower` would make the achievements screen the game's main
 * damage stat. Five categories pay the click (the ones the player does *with* the click or with
 * what it drops) and the rest pay `teamDps` (what the team kills, clears and becomes), so the
 * click's total achievement bonus stays where it was before the ladders were extended.
 */
export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  { id: "mobsKilled", label: "Ennemis vaincus", target: "teamDps", tiers: [25, 100, 500, 2_000, 10_000, 50_000] },
  { id: "bossesKilled", label: "Boss vaincus", target: "teamDps", tiers: [1, 5, 15, 40, 100, 250] },
  { id: "charactersRecruited", label: "Personnages recrutés", target: "teamDps", tiers: [1, 5, 15, 30, 60, 100] },
  { id: "arcsCleared", label: "Arcs terminés", target: "teamDps", tiers: [1, 5, 10, 20, 40, 80] },
  { id: "evolutionsUnlocked", label: "Évolutions débloquées", target: "teamDps", tiers: [1, 3, 7, 12, 20, 30] },
  { id: "crossoversUsed", label: "Crossovers activés", target: "teamDps", tiers: [1, 5, 25, 100, 400, 1_500] },
  { id: "uniquesEquipped", label: "Objets uniques équipés", target: "teamDps", tiers: [1, 3, 10, 25, 60, 150] },
  { id: "prestiges", label: "Prestiges effectués", target: "teamDps", tiers: [1, 3, 10, 25, 50, 100] },
  { id: "clicks", label: "Clics du Narrateur", target: "clickPower", tiers: [100, 1_000, 10_000, 50_000, 200_000, 1_000_000] },
  { id: "commonItemsCollected", label: "Objets communs récoltés", target: "clickPower", tiers: [20, 100, 500, 2_500, 12_000, 60_000] },
  { id: "abilitiesUsed", label: "Capacités activées", target: "clickPower", tiers: [10, 50, 250, 1_000, 5_000, 25_000] },
  { id: "passiveRanksBought", label: "Rangs de passif achetés", target: "clickPower", tiers: [1, 10, 50, 150, 400, 1_000] },
  { id: "packsOpened", label: "Packs ouverts", target: "clickPower", tiers: [1, 10, 50, 200, 750, 2_500] },
];

const BASE_BONUS = 0.02;
const BONUS_GROWTH = 1.6;

/** Bonus a tier is worth on its category's target, growing geometrically: early tiers are a taste, late ones matter. */
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

/** One permanent percent modifier per completed tier, on that category's target, folded into `allModifiers` like anything else. */
export function achievementContributions(counts: Record<string, number>): ActiveModifier[] {
  return ACHIEVEMENT_CATEGORIES.flatMap((category) => {
    const completed = achievementTiersCompleted(category, counts[category.id] ?? 0);
    return Array.from({ length: completed }, (_, tier) => ({
      sourceId: `achievement:${category.id}:${tier}`,
      target: category.target,
      kind: "percent" as const,
      value: achievementTierBonus(tier),
    }));
  });
}
