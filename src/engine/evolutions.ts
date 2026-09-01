import type { Character, CharacterEvolution } from "./types";

/** Stable save identifier for one stage; legacy saves used the bare character id. */
export const evolutionKey = (characterId: string, animeId: string) => `${characterId}@${animeId}`;

export function evolutionStage(character: Character, unlockedIds: Iterable<string>): number {
  const unlocked = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds);
  const legacyFirstStage = unlocked.has(character.id);
  let stage = 0;
  for (const [index, evolution] of (character.evolutions ?? []).entries()) {
    if (unlocked.has(evolutionKey(character.id, evolution.animeId)) || (index === 0 && legacyFirstStage)) stage = index + 1;
  }
  return stage;
}

export function unlockedEvolutions(character: Character, stage: number | boolean): CharacterEvolution[] {
  const count = typeof stage === "boolean" ? (stage ? character.evolutions?.length ?? 0 : 0) : stage;
  return (character.evolutions ?? []).slice(0, count);
}

export function activeEvolution(character: Character, stage: number | boolean): CharacterEvolution | undefined {
  const evolutions = unlockedEvolutions(character, stage);
  return evolutions[evolutions.length - 1];
}

export function activeAbility(character: Character, stage: number | boolean) {
  const evolvedAbility = [...unlockedEvolutions(character, stage)].reverse().find((evolution) => evolution.ability)?.ability;
  return evolvedAbility ?? character.ability;
}
