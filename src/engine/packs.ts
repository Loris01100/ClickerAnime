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

/** Share of a character's base damage each duplicate adds. */
export const DUPLICATE_DAMAGE_STEP = 0.25;

/**
 * Copies of one character a player may ever hold. The bonus is flat per copy and permanent, so
 * without a ceiling a single world's points eventually buy an unbounded multiplier on one
 * character; ten copies is +250% base damage on them, and the pool stops offering them after that.
 */
export const MAX_DUPLICATES = 10;

/** Damage multiplier from holding `copies` duplicates of a character; 1 with none. */
export const duplicateGrowth = (copies: number) => 1 + copies * DUPLICATE_DAMAGE_STEP;

/**
 * What a pack can hand out: recruited characters from one world at one rarity, minus the ones
 * already held at `MAX_DUPLICATES`. A pack must never reveal or strengthen someone the player has
 * not reached in the current story yet, and never sell a copy that would go over the cap — the
 * pool emptying is what closes the purchase, in the engine and in the panel alike.
 */
export function packPool(
  characters: Character[],
  animeId: string,
  rarity: Rarity,
  ownedCharacterIds: string[],
  duplicatesOf: (characterId: string) => number = () => 0
): Character[] {
  const owned = new Set(ownedCharacterIds);
  return characters.filter(
    (c) =>
      c.animeId === animeId &&
      c.rarity === rarity &&
      owned.has(c.id) &&
      duplicatesOf(c.id) < MAX_DUPLICATES
  );
}

/** Draws one character; `roll` is the 0..1 draw, passed in so the odds stay testable. */
export function drawPack(pool: Character[], roll: number): Character | null {
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
}
