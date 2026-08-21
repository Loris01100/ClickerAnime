import type { Rarity } from "./types";

/**
 * How far a character's passive bonus can be levelled. Levels past the cap keep adding damage —
 * only the passive stops growing, which is what separates the main cast from the supporting one.
 */
export const PASSIVE_LEVEL_CAP: Record<Rarity, number> = { main: 10, secondary: 5 };

/**
 * Passives are not levelled by xp: they are fed with the common item of the arc the character comes
 * from, so deepening one means going back to farm that zone. Rank 0 means the passive is still
 * locked — it does nothing until the first threshold is met.
 */
const PASSIVE_ITEM_BASE = 6;
const PASSIVE_ITEM_GROWTH = 1.5;

/** Total copies of the origin item needed to stand at `rank`. */
export function passiveItemsToReach(rank: number): number {
  if (rank <= 0) return 0;
  return Math.ceil((PASSIVE_ITEM_BASE * (Math.pow(PASSIVE_ITEM_GROWTH, rank) - 1)) / (PASSIVE_ITEM_GROWTH - 1));
}

export function passiveRank(copies: number, rarity: Rarity): number {
  const cap = PASSIVE_LEVEL_CAP[rarity];
  let rank = 0;
  while (rank < cap && copies >= passiveItemsToReach(rank + 1)) rank++;
  return rank;
}

export function isPassiveMaxed(rank: number, rarity: Rarity): boolean {
  return rank >= PASSIVE_LEVEL_CAP[rarity];
}

/** Rank plus how far into the next one the copies go, for the passive bar. */
export function passiveProgress(
  copies: number,
  rarity: Rarity
): { rank: number; into: number; need: number; maxed: boolean } {
  const rank = passiveRank(copies, rarity);
  const floor = passiveItemsToReach(rank);
  const maxed = isPassiveMaxed(rank, rarity);
  return { rank, into: copies - floor, need: maxed ? 0 : passiveItemsToReach(rank + 1) - floor, maxed };
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

/**
 * The narrator hits harder the more allies stand with them. Items no longer feed the click at all —
 * they feed passives, see `passiveRank`.
 */
export function narratorClickPower(allyCount: number): number {
  return NARRATOR_BASE_CLICK + allyCount * NARRATOR_CLICK_PER_ALLY;
}
