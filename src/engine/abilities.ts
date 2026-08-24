import type { AbilityDefinition, Character, ComboDefinition, ModifierTarget } from "./types";

export interface UnlockedAbility {
  ability: AbilityDefinition;
  /** characterId that grants it alone, or comboId if it comes from a combo */
  sourceId: string;
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
    if (ability) result.push({ ability, sourceId: character.id });
  }

  for (const combo of combos) {
    if (combo.requiredCharacterIds.length > 0 && combo.requiredCharacterIds.every((id) => owned.has(id))) {
      result.push({ ability: combo.ability, sourceId: combo.id });
    }
  }

  return result;
}

/**
 * An ability's "type" (DPS boost, click boost, ...) isn't a stored field — it's just the set of
 * stats its effects touch, the same `ModifierTarget`s `replaceModifiersByTarget` already keys off.
 */
export function abilityTargets(ability: AbilityDefinition): ModifierTarget[] {
  return [...new Set(ability.effects.map((effect) => effect.target))];
}

/**
 * True when two abilities touch at least one common stat. Activating one would cut the other's
 * buff short on that stat (`replaceModifiersByTarget`), so they must share a cooldown too — otherwise
 * the player could fire the second one for an effect it won't actually get to keep.
 */
export function abilitiesShareType(a: AbilityDefinition, b: AbilityDefinition): boolean {
  const targets = new Set(abilityTargets(a));
  return abilityTargets(b).some((target) => targets.has(target));
}

export function isAbilityReady(lastActivatedAt: number | undefined, cooldownMs: number, now: number): boolean {
  return lastActivatedAt === undefined || now - lastActivatedAt >= cooldownMs;
}

export function cooldownRemaining(lastActivatedAt: number | undefined, cooldownMs: number, now: number): number {
  if (lastActivatedAt === undefined) return 0;
  return Math.max(0, cooldownMs - (now - lastActivatedAt));
}
