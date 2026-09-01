export interface PrestigeState {
  prestigePoints: number;
  /** animes entered this run, in entry order (index = difficulty tier); wiped by a prestige */
  unlockedAnimeIds: string[];
}

export function createInitialPrestigeState(starterAnimeIds: string[] = []): PrestigeState {
  return { prestigePoints: 0, unlockedAnimeIds: [...starterAnimeIds] };
}

/**
 * How much a fully completed run (every arc of every world cleared) multiplies the gain by, on top
 * of the earnings curve: at 0% completion the gain is the bare curve, at 100% it is 1 + this.
 *
 * This is deliberately the *dominant* term — see PRESTIGE_EXPONENT. What a reset banks is meant to
 * say "how far did this run get", not "how long did you sit on one arc".
 */
export const COMPLETION_GAIN_BONUS = 9;

/** Currency worth one prestige point at 0% completion — the curve's threshold too. */
export const PRESTIGE_SCALE = 5_000;

/**
 * Curve exponent, deliberately *low*. Currency spans a colossal range between clearing the first
 * world and clearing the last, so any exponent near 0.5 turns that span into a gain of thousands: a
 * single full run used to bank ~6 600 points against a 775-point tree, i.e. the whole of the game's
 * meta-progression bought the first time it was reachable. A low exponent keeps that span worth
 * ~×10, and COMPLETION_GAIN_BONUS above supplies the rest — so farming an arc longer barely helps,
 * and clearing one more arc does. A full clear banks a few hundred points, several runs buy the tree.
 *
 * **This is a per-world knob, and it has to be re-checked every time a world is added.** Only half
 * of the "adding a world self-balances" story is true: `runCompletion` is a share of *all* the
 * game's arcs, so new content does dilute what a partial run banks — but a *full* clear is still
 * 100% completion against a far bigger `lifetimeEarned`, and that half grows unchecked. Boruto
 * multiplied a full run's earnings by ~366 (8.76B → 3.21T), which at the old 0.22 took a full clear
 * from 236 points to 866 — one run buying the entire 775-point tree. 0.16 puts it back at ~250.
 */
export const PRESTIGE_EXPONENT = 0.16;

/**
 * Diminishing-returns curve so prestige points don't scale linearly with lifetime earnings,
 * scaled by `completion` (0..1, the share of the game's arcs cleared this run): resetting deep
 * into the game banks more than resetting early with the same earnings.
 */
export function calculatePrestigeGain(lifetimeEarned: number, scale = PRESTIGE_SCALE, completion = 0): number {
  if (lifetimeEarned < scale) return 0;
  const clamped = Math.min(Math.max(completion, 0), 1);
  return Math.floor((lifetimeEarned / scale) ** PRESTIGE_EXPONENT * (1 + COMPLETION_GAIN_BONUS * clamped));
}

export function canUnlockAnime(state: PrestigeState, animeId: string, cost: number): boolean {
  return !state.unlockedAnimeIds.includes(animeId) && state.prestigePoints >= cost;
}

/** Player picks freely which anime to unlock next — no forced rotation. */
export function unlockAnime(state: PrestigeState, animeId: string, cost: number): PrestigeState {
  if (!canUnlockAnime(state, animeId, cost)) return state;
  return {
    prestigePoints: state.prestigePoints - cost,
    unlockedAnimeIds: [...state.unlockedAnimeIds, animeId],
  };
}

/**
 * Banks the gain and sends the player back to square one: the worlds entered are wiped too.
 * `scale` is the default currency threshold worth one prestige point; `completion` is the share of
 * the game's arcs cleared this run (see `calculatePrestigeGain`).
 *
 * What a reset banks is `calculatePrestigeGain` and nothing else. It used to take a `gainMultiplier`
 * for the tree's old "Faveur du destin" — a rolled 2x on the whole gain — which is precisely the
 * term `PRESTIGE_EXPONENT` above is tuned to keep flat; the node it belonged to is gone (see
 * `FREE_PACK_CHANCE`), and with it the one thing that could multiply this curve from outside.
 */
export function applyPrestige(
  state: PrestigeState,
  lifetimeEarned: number,
  scale?: number,
  completion = 0
): PrestigeState {
  return {
    prestigePoints: state.prestigePoints + calculatePrestigeGain(lifetimeEarned, scale, completion),
    unlockedAnimeIds: [],
  };
}
