import type { Item, Rarity } from "./types";

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
 * `LEVEL_DAMAGE_STEP` is the pacing knob: how much of the base stat one level is worth.
 */
export const LEVEL_DAMAGE_STEP = 0.6;

export function levelGrowth(level: number): number {
  return 1 + level * LEVEL_DAMAGE_STEP;
}

/** ponytail: one global xp curve for every character, split per rarity if pacing needs it. */
const XP_BASE = 50;
const XP_GROWTH = 1.35;

/** Total xp a character must have accumulated to stand at `level`. */
export function xpToReach(level: number): number {
  if (level <= 0) return 0;
  return Math.ceil((XP_BASE * (Math.pow(XP_GROWTH, level) - 1)) / (XP_GROWTH - 1));
}

export function levelFromXp(xp: number): number {
  let level = 0;
  // The curve is geometric, so this converges in a few dozen steps even for absurd xp totals.
  while (xp >= xpToReach(level + 1)) level++;
  return level;
}

/** Level plus how far into it the character is, for the xp bar. */
export function xpProgress(xp: number): { level: number; into: number; need: number } {
  const level = levelFromXp(xp);
  const floor = xpToReach(level);
  return { level, into: xp - floor, need: xpToReach(level + 1) - floor };
}

export const NARRATOR_BASE_CLICK = 1;
export const NARRATOR_CLICK_PER_ALLY = 1;

/** Commons stack, so their bonus counts once per copy found; uniques are capped at one copy. */
export function itemClickBonus(items: Item[], counts: Record<string, number>): number {
  return items.reduce((sum, item) => sum + item.clickBonus * (counts[item.id] ?? 0), 0);
}

/**
 * The narrator hits harder the more allies stand with them, and the more items they have found
 * across every world — items are never lost, so this floor only ever rises.
 */
export function narratorClickPower(allyCount: number, itemBonus: number): number {
  return NARRATOR_BASE_CLICK + allyCount * NARRATOR_CLICK_PER_ALLY + itemBonus;
}
