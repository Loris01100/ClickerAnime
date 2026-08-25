import type { AbilityDefinition, Character, ComboDefinition } from "./types";

export interface UnlockedAbility {
  ability: AbilityDefinition;
  /** characterId that grants it alone, or comboId if it comes from a combo */
  sourceId: string;
  /** who the buff applies to: the character alone, or every member of the combo */
  characterIds: string[];
}

/**
 * An ability can be unlocked two ways: owning a single character that grants one,
 * or owning every character required by a combo. An evolved character's ability, if their
 * evolution defines one, replaces their base ability outright — never both at once.
 */
export function getUnlockedAbilities(
  ownedCharacterIds: string[],
  characters: Character[],
  combos: ComboDefinition[],
  evolvedCharacterIds: string[] = []
): UnlockedAbility[] {
  const owned = new Set(ownedCharacterIds);
  const evolved = new Set(evolvedCharacterIds);
  const result: UnlockedAbility[] = [];

  for (const character of characters) {
    if (!owned.has(character.id)) continue;
    const ability = (evolved.has(character.id) && character.evolution?.ability) || character.ability;
    if (ability) result.push({ ability, sourceId: character.id, characterIds: [character.id] });
  }

  for (const combo of combos) {
    if (combo.requiredCharacterIds.length > 0 && combo.requiredCharacterIds.every((id) => owned.has(id))) {
      result.push({ ability: combo.ability, sourceId: combo.id, characterIds: combo.requiredCharacterIds });
    }
  }

  return result;
}

/**
 * How much a scoped percent/multiplier buff is worth over its printed value. A buff only boosts the
 * characters it comes from (`computeScopedStat`), so the same number moves the team far less than it
 * did back when one buff lifted everyone — by exactly its share of the team, and by how little of
 * the time it is up. The duty cycle is the part the data knows: an ability up 10s out of a 80s
 * cooldown is worth an eighth of what a permanent buff would be, so it hits eight times as hard
 * while it lasts. Team share is left alone on purpose — that share *is* the design: a buff is worth
 * what the allies it names are worth. Checked with `npm run sim` (docs/simulator.md).
 */
export function scopedMagnitude(ability: AbilityDefinition): number {
  if (ability.durationMs <= 0) return 1;
  return Math.max(1, ability.cooldownMs / ability.durationMs);
}

export function isAbilityReady(lastActivatedAt: number | undefined, cooldownMs: number, now: number): boolean {
  return lastActivatedAt === undefined || now - lastActivatedAt >= cooldownMs;
}

export function cooldownRemaining(lastActivatedAt: number | undefined, cooldownMs: number, now: number): number {
  if (lastActivatedAt === undefined) return 0;
  return Math.max(0, cooldownMs - (now - lastActivatedAt));
}
