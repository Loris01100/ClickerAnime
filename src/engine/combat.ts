import type { Arc, Enemy } from "./types";

/** Ordinary fights between two boss victories in a cleared arc. */
export const BOSS_REPLAY_KILLS = 50;

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
 * The boss shows up once enough mobs are down. After the first victory, every 50 further mob wins
 * bring it back; the caller resets `kills` after each boss so this repeats forever. Timing out sets
 * `retreatedFromBoss`: the fight falls back to the regular mob pool instead of respawning the same
 * boss forever, so a player who is not yet strong enough is never stuck. The boss only shows up
 * again once the player deliberately re-challenges it, via `gameState.challengeBoss`.
 */
export function nextEnemy(
  arc: Arc,
  kills: number,
  recruitedIds: string[],
  cleared: boolean,
  retreatedFromBoss = false
): Enemy {
  if (!retreatedFromBoss && kills >= (cleared ? BOSS_REPLAY_KILLS : arc.mobsToBoss)) return arc.boss;
  const pool = encounterPool(arc, recruitedIds);
  return pool.length > 0 ? pool[kills % pool.length] : arc.boss;
}

/** Characters of this zone the player has not beaten yet. */
export function pendingRecruits(arc: Arc, recruitedIds: string[]): string[] {
  return arc.mobs
    .map((m) => m.characterId)
    .filter((id): id is string => !!id && !recruitedIds.includes(id));
}

/**
 * How long the team needs to fell `hp` at `dps`, in ms — `Infinity` when it deals none. The one
 * number that says whether an arc is worth fighting: against a boss it is measured against the
 * boss's own `timerMs`, which is the only real wall in the game (see `Enemy.timerMs`).
 */
export function timeToKillMs(hp: number, dps: number): number {
  return dps > 0 ? (hp / dps) * 1000 : Infinity;
}

/** `roll` is a 0..1 draw supplied by the caller, so drop odds stay testable without stubbing RNG. */
export function rollsDrop(enemy: Enemy, roll: number): boolean {
  if (!enemy.itemId) return false;
  return roll < (enemy.dropChance ?? 1);
}

/** What the team's damage is really worth against a farm pool — see `killRateOf`. */
export interface KillRate {
  /** Fights a second `dps` resolves on its own: overkill carries over, so it really is `dps / hp`. */
  uncapped: number;
  /** What the cap lets through — the rate the player actually collects rewards at. */
  actual: number;
  /** Share of the damage that becomes a kill, 0..1. Below 1, the surplus is discarded. */
  efficiency: number;
}

/**
 * The kill cadence of a farm, and how much of the team's damage the cap is throwing away.
 *
 * Overkill carry-over is what makes this a rate at all: a tick fells as many enemies as its damage
 * covers, so an arc whose mobs the team one-shots resolves `dps / hp` fights a second — until
 * `cap` (`MAX_KILLS_PER_SECOND`) stops it. Past that point every further point of dps is discarded
 * here, which the raw "DPS équipe" number gives no way to see: the only thing that converts it back
 * into progress is fighting somewhere the enemies are worth more hp.
 *
 * `hp` is the *full* hp of the enemies being farmed, not what is left of the one on screen: the
 * question is what the pool costs, not how far along this single fight is.
 */
export function killRateOf(hp: number, dps: number, cap: number): KillRate {
  const uncapped = hp > 0 && dps > 0 ? dps / hp : 0;
  const actual = Math.min(uncapped, cap);
  return { uncapped, actual, efficiency: uncapped > 0 ? actual / uncapped : 1 };
}
