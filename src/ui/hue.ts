import { hashSeed } from "../engine/hash";

/** Deterministic 0..360 hue from an id, used to tint a world's map background (`WorldMap.tsx`). */
export function spriteHue(seed: string): number {
  return hashSeed(`${seed}:hue`) % 360;
}
