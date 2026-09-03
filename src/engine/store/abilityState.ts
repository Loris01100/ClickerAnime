import { createMemo, createSignal } from "solid-js";
import type { AchievementId } from "../achievements";
import {
  type AbilityDiagnostic,
  type AbilityPolicy,
  autoFirable,
  cooldownOf,
  cooldownRemaining,
  diagnoseAbility,
  dutyMagnitude,
  getUnlockedAbilities,
  isAbilityReady,
  scopedMagnitude,
  type UnlockedAbility,
} from "../abilities";
import type { ChallengeRules } from "../challenges";
import { pruneExpired } from "../modifiers";
import type { SaveFile } from "../persistence";
import {
  ABILITY_DAMAGE_BOOST,
  ABILITY_DURATION_BOOST,
  abilityPolicyChoices as policyChoices,
  type PrestigeTreeCategoryId,
} from "../prestigeTree";
import type {
  AbilityDefinition,
  ActiveModifier,
  Arc,
  Character,
  Enemy,
  GameData,
  ModifierTemplate,
} from "../types";
import type { ContentIndex } from "./content";

export interface AbilityStateDeps {
  data: GameData;
  content: ContentIndex;
  saved: SaveFile | null;
  now: () => number;
  nodeLevelOf: (categoryId: PrestigeTreeCategoryId, position: number) => number;
  /** Level of the "Réflexe" node — the only thing that opens a firing plan other than "always". */
  reflexLevel: () => number;
  ownedCharacterIds: () => string[];
  evolvedCharacterIds: () => string[];
  /** Successive forms reached — `diagnoseAbility` needs it to know which ability is in play. */
  evolutionStageOf: (character: Character) => number;
  activeArc: () => Arc | null;
  activeChallengeId: () => string | null;
  challengeRules: () => ChallengeRules;
  /** Who is abroad right now — their ability is out of reach, exactly like their passive. */
  awayCharacterIds: () => Set<string>;
  enemy: () => Enemy | null;
  bumpAchievement: (categoryId: AchievementId, amount?: number) => void;
}

/**
 * Abilities as the run actually plays them: which are unlocked, what firing one is worth, when it
 * comes back, and the buffs it leaves running.
 *
 * The slice owns `temporaryModifiers` — the only *timed* modifier source in the game — which is why
 * it is created before the modifier fold rather than after the roster it comes from: everything
 * downstream reads the buff list, nothing here reads the fold.
 *
 * Two invariants are enforced here rather than watched (`docs/modifiers.md`):
 *  - **a buff is scoped to the character it comes from**, so every ability can run at once and
 *    re-firing one refreshes its own buff instead of stacking a second copy;
 *  - **a story ability does not travel**: `getUnlockedAbilities` is handed the active arc, so an
 *    ability whose character is abroad cannot be listed, fired, or automated.
 */
export function createAbilityState(deps: AbilityStateDeps) {
  const { data, content } = deps;

  const [temporaryModifiers, setTemporaryModifiers] = createSignal<ActiveModifier[]>([]);
  // Combat itself restarts on reload, but cooldowns do not: otherwise Ctrl+F5 becomes an ability reset.
  const [abilityLastUsed, setAbilityLastUsed] = createSignal<Record<string, number>>(
    deps.saved?.abilityLastUsed ?? {}
  );
  /**
   * How the automation is allowed to spend each ability — a preference, like `autoClickEnabled`, so
   * it survives a prestige. Only non-default entries are stored.
   */
  const [abilityPolicy, setAbilityPolicyMap] = createSignal<Record<string, AbilityPolicy>>(
    deps.saved?.abilityPolicy ?? {}
  );

  /** The plans "Réflexe" has opened at its current level — [] while the node is unbought. */
  const abilityPolicyChoices = () => policyChoices(deps.reflexLevel());

  /**
   * A plan the node no longer opens reads as `"always"`: a prestige reset can't take levels away,
   * but a save carried across a rebalance can, and a stored plan must never silently keep working.
   */
  const abilityPolicyOf = (abilityId: string): AbilityPolicy => {
    const stored = abilityPolicy()[abilityId] ?? "always";
    return abilityPolicyChoices().includes(stored) ? stored : "always";
  };

  function setAbilityPolicy(abilityId: string, policy: AbilityPolicy) {
    setAbilityPolicyMap((map) => {
      const next = { ...map };
      if (policy === "always") delete next[abilityId];
      else next[abilityId] = policy;
      return next;
    });
  }

  /** Every ability granted by the roster, before the current anime or challenge filters it. */
  const ownedAbilities = createMemo(() =>
    getUnlockedAbilities(deps.ownedCharacterIds(), data.characters, deps.evolvedCharacterIds())
  );

  /**
   * How many abilities are asleep because their character is abroad. The bar filters them out
   * entirely, so without this the roster would just quietly shrink on arrival in a new world and
   * the player would have no way to tell a travelled ability from one never unlocked.
   */
  const sleepingAbilities = createMemo(() => {
    const away = deps.awayCharacterIds();
    return ownedAbilities().filter((unlocked) => away.has(unlocked.sourceId));
  });

  const unlockedAbilities = createMemo(() =>
    // "Le Silence des héros" takes every ability away at the source: nothing to activate and
    // nothing for the "Réflexe" automation to fire. Being abroad takes them away the same way, one
    // character at a time — see `getUnlockedAbilities`.
    deps.challengeRules().noAbilities
      ? []
      : getUnlockedAbilities(deps.ownedCharacterIds(), data.characters, deps.evolvedCharacterIds(), deps.activeArc())
  );

  /** How much a scoped buff is worth over its printed value right now — see `scopedMagnitude`. */
  const abilityCoverage = createMemo(() => {
    const covered = new Set(unlockedAbilities().flatMap((u) => u.characterIds));
    return scopedMagnitude(deps.ownedCharacterIds().length, covered.size);
  });

  /**
   * A percent or multiplier buff lifts its own characters only, so it is worth its printed value
   * times the share of the team it names — `scopedMagnitude` normalises that share against how much
   * of the roster any ability reaches at all (see there). Flats are untouched by both: a flat bump
   * lands whole on its character either way, and node 2 deliberately reads as a percent.
   */
  function boostedAbilityValue(effect: ModifierTemplate, ab: AbilityDefinition, level: number): number {
    if (effect.kind === "flat") return effect.value;
    const magnitude = abilityCoverage() * dutyMagnitude(ab) * (1 + ABILITY_DAMAGE_BOOST * level);
    if (effect.kind === "percent") return effect.value * magnitude;
    return 1 + (effect.value - 1) * magnitude;
  }

  /**
   * An ability's effects, ready to drop into `temporaryModifiers`. The "DPS Équipe" tree can boost
   * a percent/multiplier effect's magnitude (node 2) and stretch its duration (node 4) — flat
   * effects are left alone since "damage boost" is meant to read as a percent, not a flat bump.
   */
  function buildAbilityModifiers(unlocked: UnlockedAbility): ActiveModifier[] {
    const { ability, characterIds } = unlocked;
    const nowMs = Date.now();
    const damageBoostLevel = deps.nodeLevelOf("teamDps", 2);
    const durationLevel = deps.nodeLevelOf("teamDps", 4);
    const duration =
      durationLevel > 0 ? ability.durationMs * (1 + ABILITY_DURATION_BOOST * durationLevel) : ability.durationMs;
    // One modifier per scoped character: a buff only ever boosts the character it comes from, which
    // is what lets every ability run at once (see `computeScopedStat`).
    return ability.effects.flatMap((effect) =>
      characterIds.map((characterId) => ({
        ...effect,
        value: boostedAbilityValue(effect, ability, damageBoostLevel),
        sourceId: ability.id,
        scope: characterId,
        expiresAt: nowMs + duration,
      }))
    );
  }

  /** Applies an ability's effects without touching its cooldown — the "Clic du Narrateur" tier 5 freebie. */
  function triggerAbilityEffects(unlocked: UnlockedAbility) {
    // Re-firing an ability refreshes its own buff instead of stacking a second copy of it; every
    // *other* ability keeps running, scoped to its own characters.
    setTemporaryModifiers((existing) => [
      ...existing.filter((m) => m.sourceId !== unlocked.ability.id),
      ...buildAbilityModifiers(unlocked),
    ]);
  }

  function activateAbility(abilityId: string) {
    const unlocked = unlockedAbilities().find((u) => u.ability.id === abilityId);
    if (!unlocked) return false;

    const nowMs = Date.now();
    if (!isAbilityReady(abilityLastUsed()[abilityId], cooldownOf(unlocked.ability), nowMs)) return false;

    triggerAbilityEffects(unlocked);
    setAbilityLastUsed((used) => ({ ...used, [abilityId]: nowMs }));
    deps.bumpAchievement("abilitiesUsed");
    return true;
  }

  /** Abilities off cooldown right now — the bar's count, and what `activateReadyAbilities` fires. */
  const readyAbilities = createMemo(() =>
    unlockedAbilities().filter((u) =>
      isAbilityReady(abilityLastUsed()[u.ability.id], cooldownOf(u.ability), deps.now())
    )
  );

  /** Is the enemy in front of us the arc's boss — the one condition a `"boss"` policy waits for. */
  const onBoss = () => {
    const arc = deps.activeArc();
    return !!arc && deps.enemy()?.id === arc.boss.id;
  };

  /** Buffs running right now — what the ability bar shows as the live stack. */
  const activeBuffs = createMemo(() => {
    const live = pruneExpired(temporaryModifiers(), deps.now());
    return [...new Set(live.map((m) => m.sourceId))];
  });

  return {
    temporaryModifiers,
    abilityLastUsed,
    abilityPolicy,
    abilityPolicyChoices,
    abilityPolicyOf,
    setAbilityPolicy,
    ownedAbilities,
    unlockedAbilities,
    sleepingAbilities,
    sleepingAbilityCount: createMemo(() => sleepingAbilities().length),
    readyAbilities,
    activeBuffs,
    activateAbility,
    triggerAbilityEffects,
    abilityCoverage,
    /** What a buff's printed percent/multiplier is really worth right now — for the tooltips. */
    abilityMagnitudeOf: (ability: AbilityDefinition) => abilityCoverage() * dutyMagnitude(ability),
    abilityCooldownRemaining(abilityId: string): number {
      const ability = unlockedAbilities().find((u) => u.ability.id === abilityId)?.ability;
      return cooldownRemaining(abilityLastUsed()[abilityId], ability ? cooldownOf(ability) : 0, deps.now());
    },
    /**
     * Fires every ability that is off cooldown, and returns how many went off. Buffs stack now, so
     * firing them all is simply the best play — that used to be impossible (they locked each other
     * out), and clicking through forty buttons to do it by hand is not a decision, it's chores.
     */
    activateReadyAbilities: () => readyAbilities().filter((u) => activateAbility(u.ability.id)).length,
    /**
     * What the "Réflexe" automation fires: the ready abilities the player's plan allows right now.
     * Still cadence and scope only — a policy can delay an ability, never make one worth more.
     */
    activatePlannedAbilities: () =>
      autoFirable(readyAbilities(), unlockedAbilities(), abilityPolicyOf, onBoss()).filter((u) =>
        activateAbility(u.ability.id)
      ).length,
    /** Every owned ability with the exact reason it is ready, cooling, active or unavailable. */
    abilityDiagnostics: createMemo<AbilityDiagnostic[]>(() => {
      const running = new Set(activeBuffs());
      return ownedAbilities().flatMap((unlocked) => {
        const character = content.characterOf(unlocked.sourceId);
        if (!character) return [];
        return [
          diagnoseAbility(unlocked, character, {
            activeArc: deps.activeArc(),
            evolved: deps.evolutionStageOf(character),
            challengeId: deps.activeChallengeId(),
            noAbilities: deps.challengeRules().noAbilities === true,
            lastActivatedAt: abilityLastUsed()[unlocked.ability.id],
            now: deps.now(),
            active: running.has(unlocked.ability.id),
          }),
        ];
      });
    }),
    /**
     * Drops the buffs that have just expired, and says whether any had. The fold already ignores an
     * expired buff to the millisecond, but nothing else would ever take it back *out* of the list,
     * so `modifiersByScope` would carry every ability ever fired this run.
     */
    pruneExpiredBuffs(nowMs: number): boolean {
      if (!temporaryModifiers().some((m) => m.expiresAt !== undefined && m.expiresAt <= nowMs)) return false;
      setTemporaryModifiers((mods) => pruneExpired(mods, nowMs));
      return true;
    },
    /**
     * Shaves every ability still cooling — the "Clic du Narrateur" node 4 perk, fired by the click.
     * Only abilities actually on cooldown are touched: pushing an already-ready timestamp further
     * into the past changes nothing and lets it drift without bound.
     */
    reduceCooldowns(reductionMs: number, nowMs: number) {
      setAbilityLastUsed((used) => {
        const next = { ...used };
        for (const unlocked of unlockedAbilities()) {
          const at = next[unlocked.ability.id];
          if (at !== undefined && nowMs - at < cooldownOf(unlocked.ability)) {
            next[unlocked.ability.id] = at - reductionMs;
          }
        }
        return next;
      });
    },
    /** A pause must cost a buff no time and an ability no cooldown — see `togglePause`. */
    shiftBy(offsetMs: number) {
      setTemporaryModifiers((mods) =>
        mods.map((m) => (m.expiresAt === undefined ? m : { ...m, expiresAt: m.expiresAt + offsetMs }))
      );
      setAbilityLastUsed((map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v + offsetMs])));
    },
    /** The buffs and cooldowns go with the roster that granted them; the plans are a preference. */
    reset() {
      setTemporaryModifiers([]);
      setAbilityLastUsed({});
    },
  };
}
