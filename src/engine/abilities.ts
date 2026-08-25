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
 * How much a scoped percent/multiplier buff is worth over its printed value: the roster over the
 * part of it any ability can reach.
 *
 * A buff only boosts the characters it comes from (`computeScopedStat`), so what it does to the team
 * is its printed value times the share of the team it names. Once the roster is grown and nearly
 * everyone is in some combo, that share is already the whole team and this is ~1 — the printed value
 * is what lands, which is the balance the game was tuned on. Early, three characters with abilities
 * out of fifteen owned would make every buff worth a fifth of what it reads, so the same climb that
 * used to be carried by one team-wide buff would stall; the ratio hands that back.
 *
 * Half of the compensation; `dutyMagnitude` is the other half, and `SCOPED_BUFF_CAP` is what stops
 * the two from running away once a dozen buffs land on the same character.
 */
export function scopedMagnitude(ownedCount: number, coveredCount: number): number {
  if (coveredCount <= 0) return 1;
  return Math.max(1, ownedCount / coveredCount);
}

/**
 * The second half of it: how little of the time the ability is actually up. A buff up 10s out of an
 * 80s cooldown is worth an eighth of a permanent one, so it hits eight times as hard while it lasts
 * — otherwise a scoped buff, on a couple of allies for a few seconds, is noise. What keeps this from
 * running away when a dozen of them land on the same character is `SCOPED_BUFF_CAP`, not a cap here.
 */
export function dutyMagnitude(ability: AbilityDefinition): number {
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
