import type { AbilityDefinition, Character, ComboDefinition } from "./types";

export interface UnlockedAbility {
  ability: AbilityDefinition;
  /** characterId that grants it alone, or comboId if it comes from a combo */
  sourceId: string;
}

/**
 * An ability can be unlocked two ways: owning a single character that grants one,
 * or owning every character required by a combo.
 */
export function getUnlockedAbilities(
  ownedCharacterIds: string[],
  characters: Character[],
  combos: ComboDefinition[]
): UnlockedAbility[] {
  const owned = new Set(ownedCharacterIds);
  const result: UnlockedAbility[] = [];

  for (const character of characters) {
    if (character.ability && owned.has(character.id)) {
      result.push({ ability: character.ability, sourceId: character.id });
    }
  }

  for (const combo of combos) {
    if (combo.requiredCharacterIds.length > 0 && combo.requiredCharacterIds.every((id) => owned.has(id))) {
      result.push({ ability: combo.ability, sourceId: combo.id });
    }
  }

  return result;
}

export function isAbilityReady(lastActivatedAt: number | undefined, cooldownMs: number, now: number): boolean {
  return lastActivatedAt === undefined || now - lastActivatedAt >= cooldownMs;
}

export function cooldownRemaining(lastActivatedAt: number | undefined, cooldownMs: number, now: number): number {
  if (lastActivatedAt === undefined) return 0;
  return Math.max(0, cooldownMs - (now - lastActivatedAt));
}
