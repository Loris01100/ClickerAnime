import { hashSeed } from "../engine/hash";
import type { Anime } from "../engine/types";

/** Deterministic 0..360 hue from an id, used as the fallback art direction for an unstyled world. */
export function spriteHue(seed: string): number {
  return hashSeed(`${seed}:hue`) % 360;
}

/**
 * The hue a world is drawn in — the single entry point for per-anime art direction (`design.md` §2).
 * A hand-picked `themeHue` wins (Konoha's orange, Shippuden's dark red); anything without one falls
 * back to the hash, so a prototype world is still distinct without any styling work.
 *
 * Callers set it as the `--world-hue` custom property on a container and let `styles.css` do the
 * rest — no component ever builds a colour string itself.
 */
export function themeOf(anime: Anime | undefined): number {
  if (!anime) return 0;
  return anime.themeHue ?? spriteHue(anime.id);
}
