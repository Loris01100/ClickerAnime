import type { Character, Rarity } from "./types";

/**
 * Packs are the one way to get a character *again*. Refighting their arc never does: a recruit
 * drops out of the mob pool for good, so a world's own currency — one point per fight won there —
 * buys random draws instead, and every duplicate makes that character hit harder, forever.
 */

/** Points one pack costs, by the rarity of the pool it draws from. */
export const PACK_COST: Record<Rarity, number> = { main: 500, secondary: 250 };

/** Points granted by a fight won, in the world the fight happened in. */
export const POINTS_PER_KILL = 1;

/** Share of a character's base damage each duplicate adds. Uncapped — that is the point. */
export const DUPLICATE_DAMAGE_STEP = 0.25;

/** Damage multiplier from holding `copies` duplicates of a character; 1 with none. */
export const duplicateGrowth = (copies: number) => 1 + copies * DUPLICATE_DAMAGE_STEP;

/**
 * What a pack can hand out: one world's cast at one rarity, owned or not. Not filtered by the
 * team — duplicates survive prestige, so a copy of someone not met yet is banked, never wasted.
 */
export function packPool(characters: Character[], animeId: string, rarity: Rarity): Character[] {
  return characters.filter((c) => c.animeId === animeId && c.rarity === rarity);
}

/** Draws one character; `roll` is the 0..1 draw, passed in so the odds stay testable. */
export function drawPack(pool: Character[], roll: number): Character | null {
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
}
