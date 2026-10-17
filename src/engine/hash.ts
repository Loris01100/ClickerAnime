/**
 * Deterministic id → number hash (FNV-1a), shared by anything that needs a stable value derived
 * from an id: the world-map tint hue (`ui/hue.ts`), the world-map layout (`mapLayout.ts`), the
 * autoclicker's pop scatter (`ui/ClickStage.tsx`) and — the one that really binds — the tower's
 * opponents, which are drawn from this hash so that floor 37 is the same floor for every player and
 * on every attempt (`docs/tower.md`). Lives in the engine, not `ui/`, so pure engine modules never
 * have to reach into `ui/` for it.
 *
 * **Its numbers are frozen by that promise.** Any change to what gets folded in re-rolls every
 * tower floor and shifts every map node, for players mid-climb included. That is why the loop walks
 * UTF-16 **code units** with `charCodeAt`, and why a linter asking for `codePointAt` is answered
 * here rather than in the code:
 *
 * - FNV-1a is defined over a sequence of fixed-width units, not over user-perceived characters.
 *   Feeding both halves of a surrogate pair in turn is not a bug in a hash — it is the hash.
 * - The mechanical rewrite, `codePointAt(i)` on the same `i++` loop, is the actual trap: on a
 *   surrogate pair it folds in the whole code point *and then* the low surrogate again, silently
 *   producing a third set of numbers. Every id in the game is ASCII today, so all three forms agree
 *   on all 13 639 seeds the content produces — they only part on input that cannot occur yet, which
 *   is exactly when a silent divergence would be hardest to notice.
 *
 * So: not a correctness question, a stability one. If a seed ever does need to carry text beyond
 * the BMP, change this deliberately and accept that the tower and the maps are re-rolled with it.
 */

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;

export function hashSeed(seed: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i); // NOSONAR — code units on purpose, see above
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}
