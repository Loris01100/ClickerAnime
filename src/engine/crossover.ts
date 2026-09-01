import type { Character, SynergyConfig } from "./types";

/**
 * Cristaux de crossover — the one resource that only exists because the game is inter-anime.
 * They drop only while the team spans two worlds, and they buy a window where the synergy malus
 * (see synergy.ts, the "characters weaken outside their world" rule) is lifted entirely.
 */
export const CROSSOVER_MOB_CHANCE = 0.02;
export const CROSSOVER_BOSS_REWARD = 5;
export const CROSSOVER_COST = 12;
export const CROSSOVER_DURATION_MS = 60_000;

/** No crystals from a mono-world team: mixing is the thing being rewarded. */
export function isMixedTeam(characters: Character[]): boolean {
  return new Set(characters.map((c) => c.animeId)).size > 1;
}

/**
 * While a crossover is up everyone fights at full power wherever they stand. Damage only — a
 * passive is still a story ability and stays shut off outside its own anime (see
 * `characterContributions`).
 */
export function crossoverSynergyConfig(config: SynergyConfig): SynergyConfig {
  return {
    ...config,
    sameAnimeMalus: config.matchingArcMultiplier,
    otherAnimeMalus: config.matchingArcMultiplier,
  };
}
