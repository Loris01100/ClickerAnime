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
 */
export const COMPLETION_GAIN_BONUS = 3;

/** Currency worth one prestige point at 0% completion — the curve's threshold too. */
export const PRESTIGE_SCALE = 100_000;

/**
 * Curve exponent. Above 0.5 (the old sqrt) the gain keeps growing with how deep a run went instead
 * of flattening out: it is the main "is prestige worth it?" knob.
 */
export const PRESTIGE_EXPONENT = 0.65;

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
 * the game's arcs cleared this run (see `calculatePrestigeGain`); `gainMultiplier` is the
 * "Destin" tier 5 perk (a random 2x rolled by the caller — this function itself stays free of randomness).
 */
export function applyPrestige(
  state: PrestigeState,
  lifetimeEarned: number,
  scale?: number,
  completion = 0,
  gainMultiplier = 1
): PrestigeState {
  return {
    prestigePoints:
      state.prestigePoints + calculatePrestigeGain(lifetimeEarned, scale, completion) * gainMultiplier,
    unlockedAnimeIds: [],
  };
}
