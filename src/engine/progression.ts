import type { Arc } from "./types";

/** Each world entered after a finished one costs this much more to clear. */
export const DIFFICULTY_GROWTH = 2.5;

export type ArcProgress = Record<string, number>;

/**
 * Difficulty tier of an anime = how many animes were entered before it. Since a new anime can only
 * be entered once every previous one is finished, the position in the unlock list *is* the number of
 * worlds already cleared — and freezing it at entry keeps a finished anime finished forever, instead
 * of re-locking it every time the global difficulty rises.
 */
export function animeTier(unlockedAnimeIds: string[], animeId: string): number {
  const index = unlockedAnimeIds.indexOf(animeId);
  return index < 0 ? unlockedAnimeIds.length : index;
}

export function difficultyMultiplier(tier: number): number {
  return Math.pow(DIFFICULTY_GROWTH, tier);
}

export function arcGoal(arc: Arc, tier: number): number {
  return Math.ceil(arc.baseGoal * difficultyMultiplier(tier));
}

export function arcsOfAnime(arcs: Arc[], animeId: string): Arc[] {
  return arcs.filter((a) => a.animeId === animeId).sort((a, b) => a.order - b.order);
}

export function isArcComplete(arc: Arc, progress: ArcProgress, tier: number): boolean {
  return (progress[arc.id] ?? 0) >= arcGoal(arc, tier);
}

/** An arc opens once the previous arc of its anime is cleared; the first one is always open. */
export function isArcUnlocked(arcs: Arc[], arc: Arc, progress: ArcProgress, tier: number): boolean {
  const ordered = arcsOfAnime(arcs, arc.animeId);
  const index = ordered.findIndex((a) => a.id === arc.id);
  if (index <= 0) return true;
  return isArcComplete(ordered[index - 1], progress, tier);
}

export function isAnimeComplete(arcs: Arc[], animeId: string, progress: ArcProgress, tier: number): boolean {
  const ordered = arcsOfAnime(arcs, animeId);
  return ordered.length > 0 && ordered.every((arc) => isArcComplete(arc, progress, tier));
}

/**
 * The player may head to a new anime only when nothing is left in progress: at the very start
 * (nothing entered yet) or once every anime already entered is finished.
 */
export function canEnterNewAnime(
  unlockedAnimeIds: string[],
  arcs: Arc[],
  progress: ArcProgress
): boolean {
  return unlockedAnimeIds.every((id) => isAnimeComplete(arcs, id, progress, animeTier(unlockedAnimeIds, id)));
}
