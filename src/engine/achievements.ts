import type { ActiveModifier, ModifierTarget } from "./types";

export interface AchievementCategory {
  id: string;
  label: string;
  /** Which stat this ladder's tiers pay into — see ACHIEVEMENT_CATEGORIES. */
  target: ModifierTarget;
  /** thresholds to reach, one per tier, strictly increasing */
  tiers: readonly number[];
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
export const ACHIEVEMENT_CATEGORIES = [
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
] as const satisfies readonly AchievementCategory[];

/**
 * Every ladder's id, derived from the list above rather than written out a second time.
 *
 * The counts themselves are a `Record<string, number>` — they come out of a save file, so they have
 * to be — and that is exactly what makes a mistyped id invisible: `counts.abilitiesActivated` is a
 * legal read that returns `undefined` forever, and no compiler and no test says a word. It happened
 * twice in one screen: `App.tsx` fed `deriveDisclosure` an `abilitiesActivated` and a
 * `crossoversActivated` that nothing ever writes (the ladders are `abilitiesUsed` and
 * `crossoversUsed`), which silently disabled both "this surface is already learned" fallbacks.
 * Reading through `achievementCount` turns that class of typo into a compile error.
 */
export type AchievementId = (typeof ACHIEVEMENT_CATEGORIES)[number]["id"];

/** One ladder's lifetime count, 0 (or `fallback`) while it has never been bumped. */
export function achievementCount(
  counts: Record<string, number>,
  id: AchievementId,
  fallback = 0
): number {
  return counts[id] ?? fallback;
}

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

/**
 * What every completed tier is worth, as **one** percent modifier per target.
 *
 * It used to emit one modifier per tier — up to 78 objects rebuilt every time the team's modifiers
 * were, for a pipeline that does nothing with them but `percentSum += value`. Summing them here is
 * the same number, and the tiers stay individually visible where they are actually read: the
 * achievements screen goes through `achievementTiersCompleted` and `achievementTierBonus` directly,
 * and no caller has ever looked at these `sourceId`s.
 *
 * The two targets are emitted in the order the categories declare them, and each target's tiers are
 * summed low to high — the same order the fold added them in, which is what keeps the arithmetic
 * bit-for-bit identical (float addition is not associative, and `npm run sim` would notice).
 */
export function achievementContributions(counts: Record<string, number>): ActiveModifier[] {
  const totals = new Map<ModifierTarget, number>();
  for (const category of ACHIEVEMENT_CATEGORIES) {
    const completed = achievementTiersCompleted(category, counts[category.id] ?? 0);
    if (completed === 0) continue;
    let sum = totals.get(category.target) ?? 0;
    for (let tier = 0; tier < completed; tier++) sum += achievementTierBonus(tier);
    totals.set(category.target, sum);
  }
  return [...totals].map(([target, value]) => ({
    sourceId: `achievement:${target}`,
    target,
    kind: "percent" as const,
    value,
  }));
}
