export interface PrestigeState {
  prestigePoints: number;
  /** animes entered this run, in entry order (index = difficulty tier); wiped by a prestige */
  unlockedAnimeIds: string[];
}

export function createInitialPrestigeState(starterAnimeIds: string[] = []): PrestigeState {
  return { prestigePoints: 0, unlockedAnimeIds: [...starterAnimeIds] };
}

/** Diminishing-returns curve so prestige points don't scale linearly with lifetime earnings. */
export function calculatePrestigeGain(lifetimeEarned: number, scale = 1_000_000): number {
  if (lifetimeEarned < scale) return 0;
  return Math.floor(Math.sqrt(lifetimeEarned / scale));
}

/**
 * Flat reward for clearing an arc for the first time this run. Unlike `calculatePrestigeGain`
 * (banked only on `prestigeReset`), this trickles in mid-run so the tree stays fed by progress
 * itself, not just by resetting.
 */
export const PRESTIGE_PER_ARC_CLEAR = 1;

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
 * `scale` is the default currency threshold worth one prestige point; `gainMultiplier` is the
 * "Destin" tier 5 perk (a random 2x rolled by the caller — this function itself stays free of randomness).
 */
export function applyPrestige(
  state: PrestigeState,
  lifetimeEarned: number,
  scale?: number,
  gainMultiplier = 1
): PrestigeState {
  return {
    prestigePoints: state.prestigePoints + calculatePrestigeGain(lifetimeEarned, scale) * gainMultiplier,
    unlockedAnimeIds: [],
  };
}
