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

/**
 * Global nerf on how often an ability comes back: every printed `cooldownMs` is stretched by this
 * before the store checks readiness. Deliberately *not* folded into `dutyMagnitude` — that keeps a
 * buff's magnitude on its printed duty cycle, so the longer wait is a real loss of uptime rather
 * than the same average dps in bigger spikes.
 */
export const ABILITY_COOLDOWN_SCALE = 1.5;

/** The cooldown actually enforced: the printed one, stretched by the global nerf. */
export function cooldownOf(ability: AbilityDefinition): number {
  return ability.cooldownMs * ABILITY_COOLDOWN_SCALE;
}

export function isAbilityReady(lastActivatedAt: number | undefined, cooldownMs: number, now: number): boolean {
  return lastActivatedAt === undefined || now - lastActivatedAt >= cooldownMs;
}

export function cooldownRemaining(lastActivatedAt: number | undefined, cooldownMs: number, now: number): number {
  if (lastActivatedAt === undefined) return 0;
  return Math.max(0, cooldownMs - (now - lastActivatedAt));
}

/**
 * How the "Réflexe" automation is allowed to spend one ability. Manual firing ignores it entirely —
 * this is a plan for the robot, not a lock on the player.
 *
 * `"sync"` is what covers "ne lance A que si B est disponible" without a rule builder: every
 * ability marked sync waits until *all* of them are ready, then they go off together.
 */
export type AbilityPolicy = "always" | "boss" | "sync";

/** Which of the ready abilities the automation may fire right now, given each one's policy. */
export function autoFirable(
  ready: UnlockedAbility[],
  all: UnlockedAbility[],
  policyOf: (abilityId: string) => AbilityPolicy,
  onBoss: boolean
): UnlockedAbility[] {
  const readyIds = new Set(ready.map((u) => u.ability.id));
  const sync = all.filter((u) => policyOf(u.ability.id) === "sync");
  const syncReady = sync.length > 0 && sync.every((u) => readyIds.has(u.ability.id));
  return ready.filter((u) => {
    const policy = policyOf(u.ability.id);
    if (policy === "boss") return onBoss;
    if (policy === "sync") return syncReady;
    return true;
  });
}
