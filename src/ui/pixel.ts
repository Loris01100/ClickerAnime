/**
 * Placeholder pixel art: a deterministic sprite derived from an id, so every character, enemy and
 * boss has a stable little avatar until real artwork exists. Same id always yields the same sprite.
 */

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;

export function hashSeed(seed: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** xorshift32 — good enough to scatter pixels, and dependency-free. */
function nextState(state: number): number {
  let next = state;
  next ^= next << 13;
  next >>>= 0;
  next ^= next >> 17;
  next ^= next << 5;
  return next >>> 0;
}

export const SPRITE_WIDTH = 7;
export const SPRITE_HEIGHT = 8;

/**
 * 0 = empty, 1 = body, 2 = highlight. The grid is mirrored left/right so the result reads as a
 * creature rather than noise.
 */
export function spriteCells(seed: string, width = SPRITE_WIDTH, height = SPRITE_HEIGHT): number[][] {
  let state = hashSeed(seed) || 1;
  const half = Math.ceil(width / 2);
  const rows: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row = new Array<number>(width).fill(0);
    for (let x = 0; x < half; x++) {
      state = nextState(state);
      const cell = state % 7 === 0 ? 2 : state % 3 === 0 ? 0 : 1;
      row[x] = cell;
      row[width - 1 - x] = cell;
    }
    rows.push(row);
  }
  return rows;
}

export function spriteHue(seed: string): number {
  return hashSeed(`${seed}:hue`) % 360;
}
