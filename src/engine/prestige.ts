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

/** Banks the gain and sends the player back to square one: the worlds entered are wiped too. */
export function applyPrestige(state: PrestigeState, lifetimeEarned: number): PrestigeState {
  return {
    prestigePoints: state.prestigePoints + calculatePrestigeGain(lifetimeEarned),
    unlockedAnimeIds: [],
  };
}
