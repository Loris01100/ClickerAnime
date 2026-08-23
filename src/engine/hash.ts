/**
 * Deterministic id → number hash (FNV-1a), shared by anything that needs a stable value derived
 * from an id: the world-map tint hue (`ui/hue.ts`) and world-map layout (`mapLayout.ts`) alike.
 * Lives in the engine, not `ui/`, so pure engine modules never have to reach into `ui/` for it.
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
