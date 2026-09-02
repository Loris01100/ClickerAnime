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

/**
 * A world entered from *above* it is **re-levelled**: played at a scale, not at its printed numbers.
 *
 * `2.5^tier` was written for a chain of worlds each authored to continue the last: Shippūden opens
 * at `arcPower` 130 where Naruto ends at 78, so the tier step is the whole of the gap. It says
 * nothing about an **entry world reached late**. Hunter x Hunter, Bleach and Horimiya all open at
 * `arcPower` 6 with a ~600 hp boss — written for a fresh team — and a player walking in from Boruto
 * stands at 9.6e7 with trillions of dps. The tier hands them 15x against a gap near 1e9, so the
 * whole world scrolls past in tenths of a minute (`docs/progression.md`).
 *
 * Two numbers are frozen at entry, and they are not the same number:
 *
 * - **`worldEntryDifficulty`** — the scale its opening arc's enemy hp and rewards are played at,
 *   anchored on the heaviest arc the run has actually cleared (`arcWeight`). The arcs after it do **not** simply
 *   inherit it: `relevelledDifficulty` re-profiles the world's climb, because a visitor's dps does
 *   not climb through it the way a fresh player's does (see `RELEVEL_RAMP`).
 * - **`worldEntryScale`** — how far its `arcPower` rungs are shifted, so that the rung the world
 *   *opens* on is the one the player already stands at. This one is deliberately **not** the
 *   difficulty: the rungs feed `catchUpGrowth`, which lifts the whole carried roster, so shifting
 *   them by the difficulty would hand a hundred characters the world's entire scale for free — the
 *   world would end up easier than the one before it. Shifted this way the carried roster gains
 *   through the world exactly what the world's own internal climb is worth.
 *
 * What is deliberately *not* re-levelled is the world's own cast. Scaling their `baseDps` up to the
 * enemies was tried and it runs away: a fresh player's arc-1 recruit is level 12 with no passive,
 * while a visitor's is dropped straight into an endgame stack of levels, passives, achievements and
 * items worth a thousandfold — the same printed number is not the same character. So a re-levelled
 * world's recruits stay what they are, the carried roster stays the backbone, and the ramp is
 * profiled for that team rather than for the one the world was written for.
 *
 * It only ever raises: a world authored *above* the player — every sequel world, Shippūden's 130
 * and Boruto's 1.3e6 — comes out at its tier difficulty, untouched.
 */

/**
 * What a re-levelled world's opening arc is worth, next to the heaviest arc the run has already
 * cleared. Below 1 on purpose — crossing a border is a breather by construction (`docs/combat.md`),
 * and it costs the carried roster its passives and its abilities on top. Fitted on the simulator.
 */
export const WORLD_ENTRY_BREATHER = 0.7;

/**
 * How much of its own dps a team loses the first time it walks out of the worlds it calls home:
 * every carried character keeps its `baseDps` and loses its passive, its ability and half its damage
 * to `otherAnimeMalus` (`docs/combat.md`). Measured at 10.36T -> 1.43T crossing out of Boruto.
 *
 * It matters here because the anchor a re-levelling is calibrated on — the heaviest arc already
 * cleared — was fought by the team on the *other* side of that cliff whenever that arc belongs to a
 * world the player played natively. An arc cleared in a world that was itself re-levelled needs no
 * such discount: it was already fought abroad. This is what lets one breather serve the first
 * crossing and every crossing after it.
 */
export const BORDER_CLIFF = 12;

/**
 * What an arc weighs: the hp actually stood between the player and its clear, mobs included. Two
 * arcs with the same boss are not the same fight when one runs 18 mobs to the boss and the other 52,
 * and the mobs are most of the clock — anchoring a re-levelling on the boss alone made a world's
 * opening arc land anywhere between one and twenty minutes depending on its mob count.
 */
export function arcWeight(arc: { mobs: { baseHp: number }[]; mobsToBoss: number; boss: { baseHp: number } }): number {
  const mobs = arc.mobs ?? [];
  const meanMobHp = mobs.length > 0 ? mobs.reduce((sum, mob) => sum + mob.baseHp, 0) / mobs.length : 0;
  return meanMobHp * arc.mobsToBoss + arc.boss.baseHp;
}

/**
 * The scale a world is re-levelled to, frozen when it is entered: the tier ramp, or the breather
 * anchor above, whichever is harsher. `hardestClearedBossHp` is an *effective* hp — the authored
 * number times the difficulty it was fought at — which is what makes this self-calibrating instead
 * of one more exponent to fit per crossing.
 */
export function worldEntryScale(entryPower: number, reachedPower: number): number {
  if (entryPower <= 0 || reachedPower <= entryPower) return 1;
  return reachedPower / entryPower;
}

export function worldEntryDifficulty(tier: number, firstArcWeight: number, hardestClearedWeight: number): number {
  const tierDifficulty = difficultyMultiplier(tier);
  if (firstArcWeight <= 0 || hardestClearedWeight <= 0) return tierDifficulty;
  return Math.max(tierDifficulty, (WORLD_ENTRY_BREATHER * hardestClearedWeight) / firstArcWeight);
}

/**
 * How fast a re-levelled world's effective hp climbs per `arcPower` rung, replacing the ~3.4-4x an
 * entry world's authored table climbs at. That figure is written for a player recruiting the world's
 * whole cast on the way through; a visitor's dps climbs with the shifted rungs alone, i.e. at
 * `CATCH_UP` (0.85), so anything above that still lengthens the arcs as the world goes on. 1.1
 * reproduces the late chain, where Boruto opens at 2.4 min an arc and closes at 8.
 */
export const RELEVEL_RAMP = 1.1;

/**
 * The difficulty one arc of a re-levelled world is played at: whatever it takes to put that arc's
 * effective `arcWeight` on the `RELEVEL_RAMP` curve anchored at the world's first arc. The authored hp
 * is divided back out, exactly as `catchUpGrowth` divides the story ramp out of a `baseDps`, so what
 * survives is the arc's own deviation from its world's shape. Rewards ride the same number.
 */
export function relevelledDifficulty(
  entryDifficulty: number,
  first: { weight: number; power: number },
  arc: { weight: number; power: number }
): number {
  if (first.weight <= 0 || arc.weight <= 0 || first.power <= 0 || arc.power <= 0) return entryDifficulty;
  return entryDifficulty * (first.weight / arc.weight) * Math.pow(arc.power / first.power, RELEVEL_RAMP);
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
