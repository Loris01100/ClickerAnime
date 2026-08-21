import type { Character, Item, Rarity } from "./types";

/**
 * How far a character's passive bonus can be levelled. Levels past the cap keep adding damage —
 * only the passive stops growing, which is what separates the main cast from the supporting one.
 */
export const PASSIVE_LEVEL_CAP: Record<Rarity, number> = { main: 10, secondary: 5 };

export function passiveLevel(level: number, rarity: Rarity): number {
  return Math.min(level, PASSIVE_LEVEL_CAP[rarity]);
}

export function isPassiveMaxed(level: number, rarity: Rarity): boolean {
  return level >= PASSIVE_LEVEL_CAP[rarity];
}

/**
 * Multiplier applied to a base stat at a given level. Linear on purpose: every level grants the
 * same flat damage as the one before, and levels themselves are uncapped.
 */
export function levelGrowth(level: number): number {
  return 1 + level;
}

/** ponytail: one global cost curve, split per anime if pacing ever needs it. */
const LEVEL_COST_BASE = 25;
const LEVEL_COST_GROWTH = 1.5;

export function levelUpCost(character: Character, level: number): number {
  const rarityFactor = character.rarity === "main" ? 2 : 1;
  return Math.ceil(LEVEL_COST_BASE * rarityFactor * Math.pow(LEVEL_COST_GROWTH, level));
}

export const NARRATOR_BASE_CLICK = 1;
export const NARRATOR_CLICK_PER_ALLY = 1;

/**
 * The narrator hits harder the more allies stand with them, and the more items they have found
 * across every world — items are never lost, so this floor only ever rises.
 */
export function narratorClickPower(allyCount: number, foundItems: Item[]): number {
  const fromItems = foundItems.reduce((sum, item) => sum + item.clickBonus, 0);
  return NARRATOR_BASE_CLICK + allyCount * NARRATOR_CLICK_PER_ALLY + fromItems;
}
