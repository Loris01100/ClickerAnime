import { isHomeArc } from "./synergy";
import type { AbilityDefinition, Arc, Character } from "./types";

export interface UnlockedAbility {
  ability: AbilityDefinition;
  /** the characterId that grants it */
  sourceId: string;
  /** who the buff applies to — the character it comes from */
  characterIds: string[];
}

/**
 * An ability is unlocked by owning the character that grants one. An evolved character's ability,
 * if their evolution defines one, replaces their base ability outright — never both at once.
 *
 * **A capacity doesn't travel.** Away from every world they call home — the `otherAnimeMalus` tier,
 * the same `isHomeArc` test the passive already uses — a character's ability is simply not there:
 * not firable, not listed, nothing for the "Réflexe" automation to pick up. That is the rule
 * enforced at its source rather than watched, so there is no "ability used abroad" to detect; and
 * it is deliberately *not* lifted by a crossover window, which buys damage back and never a story
 * ability (see `crossoverSynergyConfig`). `activeArc` null — between arcs — leaves everything
 * unlocked, since there is no world to be foreign to.
 */
export function getUnlockedAbilities(
  ownedCharacterIds: string[],
  characters: Character[],
  evolvedCharacterIds: string[] = [],
  activeArc: Arc | null = null
): UnlockedAbility[] {
  const owned = new Set(ownedCharacterIds);
  const evolved = new Set(evolvedCharacterIds);
  const result: UnlockedAbility[] = [];

  for (const character of characters) {
    if (!owned.has(character.id)) continue;
    const isEvolved = evolved.has(character.id);
    if (activeArc && !isHomeArc(character, activeArc, isEvolved)) continue;
    const ability = (isEvolved && character.evolution?.ability) || character.ability;
    if (ability) result.push({ ability, sourceId: character.id, characterIds: [character.id] });
  }

  return result;
}

/**
 * How much a scoped percent/multiplier buff is worth over its printed value: the roster over the
 * part of it any ability can reach.
 *
 * A buff only boosts the character it comes from (`computeScopedStat`), so what it does to the team
 * is its printed value times the share of the team it names. Once the roster is grown and nearly
 * everyone carries an ability, that share is already the whole team and this is ~1 — the printed
 * value is what lands, which is the balance the game was tuned on. Early, three characters with
 * abilities out of fifteen owned would make every buff worth a fifth of what it reads, so the same
 * climb that used to be carried by one team-wide buff would stall; the ratio hands that back.
 *
 * Half of the compensation; `dutyMagnitude` is the other half, and `SCOPED_BUFF_CAP` is what stops
 * the two from running away once several buffs land on the same character.
 */
export function scopedMagnitude(ownedCount: number, coveredCount: number): number {
  if (coveredCount <= 0) return 1;
  return Math.max(1, ownedCount / coveredCount);
}

/**
 * The second half of it: how little of the time the ability is actually up. A buff up 10s out of an
 * 80s cooldown is worth an eighth of a permanent one, so it hits eight times as hard while it lasts
 * — otherwise a scoped buff, on a couple of allies for a few seconds, is noise. What keeps this from
 * running away when several of them land on the same character is `SCOPED_BUFF_CAP`, not a cap here.
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
