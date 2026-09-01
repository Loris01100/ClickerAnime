import type { SaveFile } from "./persistence";
import { isHomeAnime } from "./synergy";
import type { Arc, Character, Item, ModifierTemplate } from "./types";

/** Boss uniques start at rank 1; rank 4 preserves the power they had before the forge existed. */
export const UNIQUE_FORGE_MULTIPLIERS = [0, 0.5, 2 / 3, 5 / 6, 1, 7 / 6] as const;
export const UNIQUE_FORGE_FRAGMENT_COSTS = [0, 1, 5, 10, 15, 25] as const;

export function uniqueRanksFromSave(items: Item[], saved: SaveFile | null): Record<string, number> {
  const ranks = saved?.uniqueUpgradeRanks;
  const entries: [string, number][] = [];
  for (const item of items) {
    if (item.kind !== "unique") continue;
    const savedRank = ranks?.[item.id];
    // Explicit ranks are permanent mastery. Rank 4 is only the migration for a formerly owned
    // unique; applying it to unseen uniques would grant free forge progress.
    if (savedRank !== undefined) {
      entries.push([item.id, Math.max(1, Math.min(5, Math.floor(savedRank)))]);
    } else if ((saved?.itemCounts?.[item.id] ?? 0) > 0) {
      entries.push([item.id, 4]);
    }
  }
  return Object.fromEntries(entries);
}

export function scaledUniqueEffect(effect: ModifierTemplate, level: number): ModifierTemplate {
  const strength = UNIQUE_FORGE_MULTIPLIERS[level] ?? UNIQUE_FORGE_MULTIPLIERS[1];
  return {
    ...effect,
    value:
      effect.kind === "multiplier"
        ? 1 + (effect.value - 1) * strength
        : effect.value * strength,
  };
}

/**
 * Which world each item comes from — the anime of the arc whose enemy hands it over. An item
 * carries no `animeId` of its own and never will: it is authored inside a world's directory and
 * dropped by exactly one of that world's enemies, so the drop *is* the origin. Derived once from
 * the data rather than duplicated into the content, where the two could disagree.
 */
export function itemAnimeIndex(arcs: Arc[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const arc of arcs) {
    for (const enemy of [...arc.mobs, arc.boss]) {
      if (enemy.itemId) index[enemy.itemId] = arc.animeId;
    }
  }
  return index;
}

/**
 * Whether `character` may wear `item`, which comes from `itemAnimeId` (see {@link itemAnimeIndex}).
 *
 * Two rules, and the world one is the stricter: **an accessory stays in its own universe**. Only
 * someone that world belongs to — a recruit of it, someone who appears there, or someone whose
 * evolution grows into it — may wear it, the same `isHomeAnime` test that already decides whether
 * a story ability travels. A Bleach zanpakutô on an Ôtsutsuki was never a build, only a tag
 * collision. On top of it the item's own authored `equippableBy` narrows further, as before.
 *
 * An item no enemy drops has no world and is left unrestricted, so authoring one can't lock it.
 */
export function canEquipOn(character: Character, item: Item, itemAnimeId: string | undefined): boolean {
  if (item.kind !== "unique") return false;
  // The evolution's world counts before the evolution is reached: equipment is not re-checked on
  // every prestige, and an item that silently took itself off would be worse than one worn early.
  if (itemAnimeId && !isHomeAnime(character, itemAnimeId, true)) return false;
  const restriction = item.equippableBy;
  if (!restriction) return true;
  if (restriction.characterIds && !restriction.characterIds.includes(character.id)) return false;
  if (restriction.animeIds && !restriction.animeIds.includes(character.animeId)) return false;
  // Any one of the listed tags is enough, like characterIds and animeIds above — the Tenseigan is
  // "Hyûga or Ôtsutsuki", and no character carries both.
  if (restriction.tags && !restriction.tags.some((tag) => (character.tags ?? []).includes(tag))) return false;
  return true;
}

/** Imported equipment must be meaningful for current authored data, not merely well-typed. */
export function sanitizedEquipment(
  characters: Character[],
  items: Item[],
  arcs: Arc[],
  equipment: Record<string, string> | undefined,
  itemCounts: Record<string, number>,
  ownedIds: string[]
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  const worn = new Set<string>();
  const itemAnimeIds = itemAnimeIndex(arcs);
  for (const [characterId, itemId] of Object.entries(equipment ?? {})) {
    const character = characters.find((candidate) => candidate.id === characterId);
    const item = items.find((candidate) => candidate.id === itemId);
    const allowed = character && item ? canEquipOn(character, item, itemAnimeIds[item.id]) : false;
    if (
      character &&
      ownedIds.includes(characterId) &&
      item?.kind === "unique" &&
      itemCounts[itemId] > 0 &&
      allowed &&
      !worn.has(itemId)
    ) {
      cleaned[characterId] = itemId;
      worn.add(itemId);
    }
  }
  return cleaned;
}
