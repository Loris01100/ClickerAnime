import type { Rarity } from "./types";

/**
 * How far a character's passive bonus can be levelled. Levels past the cap keep adding damage —
 * only the passive stops growing, which is what separates the main cast from the supporting one.
 */
export const PASSIVE_LEVEL_CAP: Record<Rarity, number> = { main: 10, secondary: 5 };

/**
 * Passives are not levelled by xp: the player spends the common item of the arc the character comes
 * from, so deepening one means going back to farm that zone — and choosing who gets the copies.
 * Rank 0 means the passive is still locked: it does nothing until the first rank is bought.
 */
const PASSIVE_ITEM_BASE = 6;
const PASSIVE_ITEM_GROWTH = 1.5;

/**
 * Copies of the origin item spent to buy `rank`, coming from the rank below it. `discount` (0..1)
 * is the prestige tree's "Objets" tier 2 perk.
 */
export function passiveRankCost(rank: number, discount = 0): number {
  if (rank <= 0) return 0;
  return Math.ceil(PASSIVE_ITEM_BASE * Math.pow(PASSIVE_ITEM_GROWTH, rank - 1) * (1 - discount));
}

export function isPassiveMaxed(rank: number, rarity: Rarity): boolean {
  return rank >= PASSIVE_LEVEL_CAP[rarity];
}

/** What the next rank costs, and whether the copies held cover it. 0 cost means the cap is reached. */
export function passiveUpgrade(
  rank: number,
  rarity: Rarity,
  copies: number,
  discount = 0
): { rank: number; cost: number; copies: number; maxed: boolean; affordable: boolean } {
  const maxed = isPassiveMaxed(rank, rarity);
  const cost = maxed ? 0 : passiveRankCost(rank + 1, discount);
  return { rank, cost, copies, maxed, affordable: !maxed && copies >= cost };
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
const XP_BASE = 25;
/** Default steepness; the prestige tree's "XP" tier 3 perk hands callers a slightly smaller value. */
export const XP_GROWTH = 1.15;

/**
 * Kills grant this many times their currency reward as team xp. Pushed well above 1x because level
 * has no cap: a flat 1:1 income gets swallowed by the curve above after a few dozen levels and
 * leveling stalls out, leaving a character's level contributing nothing next to their ability. This
 * keeps levels climbing meaningfully throughout a run instead.
 */
export const XP_PER_KILL_REWARD = 3;

/** Total xp a character must have accumulated to stand at `level`. */
export function xpToReach(level: number, growth: number = XP_GROWTH): number {
  if (level <= 0) return 0;
  return Math.ceil((XP_BASE * (Math.pow(growth, level) - 1)) / (growth - 1));
}

export function levelFromXp(xp: number, growth: number = XP_GROWTH): number {
  let level = 0;
  // The curve is geometric, so this converges in a few dozen steps even for absurd xp totals.
  while (xp >= xpToReach(level + 1, growth)) level++;
  return level;
}

/** Level plus how far into it the character is, for the xp bar. */
export function xpProgress(xp: number, growth: number = XP_GROWTH): { level: number; into: number; need: number } {
  const level = levelFromXp(xp, growth);
  const floor = xpToReach(level, growth);
  return { level, into: xp - floor, need: xpToReach(level + 1, growth) - floor };
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
