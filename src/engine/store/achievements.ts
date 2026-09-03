import { createMemo, createSignal } from "solid-js";
import { achievementContributions, type AchievementId } from "../achievements";
import type { SaveFile } from "../persistence";
import type { ActiveModifier } from "../types";

/** The same idea as `sameNumbers`, over a short modifier list — see `achievementModifiers`. */
function sameModifiers(a: ActiveModifier[], b: ActiveModifier[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].target !== b[i].target || a[i].kind !== b[i].kind || a[i].value !== b[i].value) return false;
  }
  return true;
}

/**
 * The lifetime counters behind the achievement ladders (see `achievements.ts`), and the modifiers
 * they contribute.
 *
 * They never decrease and, unlike the rest of a run, survive `prestigeReset`; only `hardReset`
 * wipes them. `runAchievementBaseline` is the snapshot the prestige report diffs against, so a
 * report can say what *this run* did rather than what the save has ever done.
 *
 * Created before almost everything else, because `bumpAchievement` is the one call every other
 * slice makes — a drop, a recruit, an equip, a pack, a cleared arc.
 */
export function createAchievements(saved: SaveFile | null) {
  const [achievementCounts, setAchievementCounts] = createSignal<Record<string, number>>(
    saved?.achievementCounts ?? {}
  );
  const [runAchievementBaseline, setRunAchievementBaseline] = createSignal<Record<string, number>>(
    saved?.runAchievementBaseline ?? saved?.achievementCounts ?? {}
  );

  return {
    achievementCounts,
    runAchievementBaseline,
    setRunAchievementBaseline,
    /** Bumps one ladder; the tier(s) it crosses start contributing on the next `allModifiers` read. */
    bumpAchievement(categoryId: AchievementId, amount = 1) {
      setAchievementCounts((counts) => ({ ...counts, [categoryId]: (counts[categoryId] ?? 0) + amount }));
    },
    /**
     * The ladders' contribution, memoised on its *value*: the counts are bumped on every kill
     * (`mobsKilled`), but the modifiers they emit only move when a tier is actually crossed — two
     * objects, a handful of times per run. Without the custom `equals`, every kill would invalidate
     * the whole modifier fold.
     */
    achievementModifiers: createMemo(() => achievementContributions(achievementCounts()), undefined, {
      equals: sameModifiers,
    }),
    /** Only a hard reset gives back a lifetime count; a prestige is what they are counted across. */
    reset() {
      setAchievementCounts({});
      setRunAchievementBaseline({});
    },
  };
}
