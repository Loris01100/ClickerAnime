export interface PrestigeState {
  prestigePoints: number;
  /** anime rosters permanently unlocked by spending prestige points; persists across resets */
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

export function applyPrestige(state: PrestigeState, lifetimeEarned: number): PrestigeState {
  const gained = calculatePrestigeGain(lifetimeEarned);
  if (gained <= 0) return state;
  return { ...state, prestigePoints: state.prestigePoints + gained };
}
