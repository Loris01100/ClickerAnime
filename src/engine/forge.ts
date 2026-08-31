import type { SaveFile } from "./persistence";
import type { Character, Item, ModifierTemplate } from "./types";

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

/** Imported equipment must be meaningful for current authored data, not merely well-typed. */
export function sanitizedEquipment(
  characters: Character[],
  items: Item[],
  equipment: Record<string, string> | undefined,
  itemCounts: Record<string, number>,
  ownedIds: string[]
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  const worn = new Set<string>();
  for (const [characterId, itemId] of Object.entries(equipment ?? {})) {
    const character = characters.find((candidate) => candidate.id === characterId);
    const item = items.find((candidate) => candidate.id === itemId);
    const restriction = item?.equippableBy;
    const allowed =
      !restriction ||
      ((!restriction.characterIds || restriction.characterIds.includes(characterId)) &&
        (!restriction.animeIds || restriction.animeIds.includes(character?.animeId ?? "")) &&
        (!restriction.tags || restriction.tags.some((tag) => character?.tags?.includes(tag))));
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
