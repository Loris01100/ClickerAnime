import type { Arc, Enemy } from "./types";

export function enemyHp(enemy: Enemy, difficulty: number): number {
  return Math.ceil(enemy.baseHp * difficulty);
}

export function enemyReward(enemy: Enemy, difficulty: number): number {
  return enemy.reward * difficulty;
}

/** Enemies still worth meeting here: a character encounter disappears once they have joined. */
export function encounterPool(arc: Arc, recruitedIds: string[]): Enemy[] {
  const remaining = arc.mobs.filter((m) => !m.characterId || !recruitedIds.includes(m.characterId));
  // Every character of the zone recruited: fall back to the plain mobs so farming never dries up.
  return remaining.length > 0 ? remaining : arc.mobs.filter((m) => !m.characterId);
}

/**
 * The boss shows up once enough mobs are down, and only while the arc is unbeaten — a cleared arc
 * goes back to cycling mobs forever so it stays farmable.
 */
export function nextEnemy(arc: Arc, kills: number, recruitedIds: string[], cleared: boolean): Enemy {
  if (!cleared && kills >= arc.mobsToBoss) return arc.boss;
  const pool = encounterPool(arc, recruitedIds);
  return pool.length > 0 ? pool[kills % pool.length] : arc.boss;
}

/** Characters of this zone the player has not beaten yet. */
export function pendingRecruits(arc: Arc, recruitedIds: string[]): string[] {
  return arc.mobs
    .map((m) => m.characterId)
    .filter((id): id is string => !!id && !recruitedIds.includes(id));
}
