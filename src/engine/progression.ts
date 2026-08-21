import type { Anime, Arc } from "./types";

/** Each world entered after a finished one costs this much more to clear. */
export const DIFFICULTY_GROWTH = 2.5;

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

export function arcsOfAnime(arcs: Arc[], animeId: string): Arc[] {
  return arcs.filter((a) => a.animeId === animeId).sort((a, b) => a.order - b.order);
}

/** An arc opens once the previous arc of its anime is cleared; the first one is always open. */
export function isArcUnlocked(arcs: Arc[], arc: Arc, clearedArcIds: string[]): boolean {
  const ordered = arcsOfAnime(arcs, arc.animeId);
  const index = ordered.findIndex((a) => a.id === arc.id);
  if (index <= 0) return true;
  return clearedArcIds.includes(ordered[index - 1].id);
}

export function isAnimeComplete(arcs: Arc[], animeId: string, clearedArcIds: string[]): boolean {
  const ordered = arcsOfAnime(arcs, animeId);
  return ordered.length > 0 && ordered.every((arc) => clearedArcIds.includes(arc.id));
}

/**
 * Worlds of one universe are ordered: an anime with a `requiresAnimeId` stays shut until that one is
 * cleared. It applies to the paid shortcut too — prestige buys you an early entry, never a way to
 * skip a story. The chain is transitive on its own: clearing Shippuden means having entered it,
 * which already required part 1.
 */
export function isAnimeAvailable(
  animes: Anime[],
  animeId: string,
  arcs: Arc[],
  clearedArcIds: string[]
): boolean {
  const anime = animes.find((a) => a.id === animeId);
  if (!anime) return false;
  return !anime.requiresAnimeId || isAnimeComplete(arcs, anime.requiresAnimeId, clearedArcIds);
}

/**
 * The player may head to a new anime only when nothing is left in progress: at the very start
 * (nothing entered yet) or once every anime already entered is finished.
 */
export function canEnterNewAnime(unlockedAnimeIds: string[], arcs: Arc[], clearedArcIds: string[]): boolean {
  return unlockedAnimeIds.every((id) => isAnimeComplete(arcs, id, clearedArcIds));
}
