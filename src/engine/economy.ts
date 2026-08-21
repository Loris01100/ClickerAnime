import type { Character } from "./types";

/**
 * Recruit cost derived from a character's raw worth, then scaled by roster size so each
 * extra recruit costs more than the last.
 * ponytail: single global curve, split per-anime or per-rarity if balance needs it.
 */
export function recruitCost(character: Character, ownedCount: number): number {
  const worth = character.baseClickPower + character.basePassiveIncome * 2 + (character.ability ? 5 : 0);
  return Math.ceil(10 * (1 + worth) * Math.pow(1.35, ownedCount));
}
