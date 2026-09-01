import { levelGrowth, passiveGrowth } from "./growth";
import { duplicateGrowth } from "./packs";
import { unlockedEvolutions } from "./evolutions";
import type { ActiveModifier, Arc, Character, Item, ModifierTemplate, SynergyConfig } from "./types";

export const defaultSynergyConfig: SynergyConfig = {
  matchingArcMultiplier: 1.0,
  sameAnimeMalus: 0.85,
  otherAnimeMalus: 0.5,
};

/**
 * A character is strongest in the arcs listed in `arcIds` and in a later anime explicitly marked
 * as covering their whole story. They are weaker elsewhere in an anime where they appear, and
 * weakest in an anime they do not appear in. Recruitment, presence and evolution are separate:
 * being recruited in part 1 must not make a recurring character foreign to every sequel.
 */
export function synergyMultiplier(
  character: Character,
  activeArc: Arc,
  config: SynergyConfig,
  evolutionStage: number | boolean = 0
): number {
  if (character.arcIds.includes(activeArc.id)) return config.matchingArcMultiplier;
  if (character.fullSynergyAnimeIds?.includes(activeArc.animeId)) return config.matchingArcMultiplier;
  if (character.animeId === activeArc.animeId) return config.sameAnimeMalus;
  if (character.appearanceAnimeIds?.includes(activeArc.animeId)) return config.sameAnimeMalus;
  if (unlockedEvolutions(character, evolutionStage).some((evolution) => evolution.animeId === activeArc.animeId)) return config.sameAnimeMalus;
  return config.otherAnimeMalus;
}

/**
 * Whether this arc is one the character calls home: their recruitment anime, a later anime where
 * they appear, or the anime their evolution grows into once they've grown into it. Anything else is the "different world entirely"
 * tier — `otherAnimeMalus` on damage, and no passive and no ability at all (see
 * `characterContributions` and `getUnlockedAbilities`). One definition, because those three rules
 * have to agree: a character weakened for being abroad is exactly a character whose story abilities
 * stay behind.
 */
export function isHomeArc(character: Character, arc: Arc, evolutionStage: number | boolean = 0): boolean {
  return isHomeAnime(character, arc.animeId, evolutionStage);
}

/**
 * The same test, one world at a time, for the rules that have no arc to look at — equipment is
 * one: a unique may only be worn by someone this world belongs to (`canEquipItem`).
 */
export function isHomeAnime(character: Character, animeId: string, evolutionStage: number | boolean = 0): boolean {
  return (
    character.animeId === animeId ||
    character.appearanceAnimeIds?.includes(animeId) === true ||
    character.fullSynergyAnimeIds?.includes(animeId) === true ||
    unlockedEvolutions(character, evolutionStage).some((evolution) => evolution.animeId === animeId)
  );
}

/**
 * One authored effect, weakened (or deepened) by a scale factor — the synergy tier, and for a
 * passive its rank growth on top.
 *
 * A `multiplier`'s neutral point is **1, not 0**, so scaling its `value` directly is not a
 * weakening but a sign flip: an equipped unique printed x1.35 came out x0.675 at the 0.5
 * other-anime tier, i.e. strictly worse than wearing nothing at all — the item was a malus abroad.
 * Only the part above 1 is scaled, which is exactly what `scaledUniqueEffect` (forge.ts) already
 * does for the forge ranks. `flat` and `percent` are neutral at 0 and scale as they always did.
 */
function scaledEffect<T extends ModifierTemplate>(effect: T, scale: number): T {
  return {
    ...effect,
    value: effect.kind === "multiplier" ? 1 + (effect.value - 1) * scale : effect.value * scale,
  };
}

/**
 * Converts one owned character's stats + passive into modifiers, pre-scaled by their synergy with
 * the currently active arc. Damage grows with every level; the passive is driven by `passiveRank`
 * instead — copies of the origin item, see `passiveRank` — and is absent while still locked, or
 * while fighting in a different anime entirely (the passive is a story ability, it doesn't travel) —
 * unless `evolved` and that anime is the character's evolution, which counts as home. An evolved
 * character also adds every unlocked evolution bonus, scaled the same way as the passive. `duplicates` are the
 * pack copies held of this character (see packs.ts) — they multiply the base damage, uncapped.
 * `catchUp` is `catchUpGrowth` (growth.ts): how far the story's power ramp has moved since this
 * character debuted, which is what keeps an arc-1 recruit from becoming dead weight by arc 10.
 */
export function characterContributions(
  character: Character,
  activeArc: Arc | null,
  config: SynergyConfig = defaultSynergyConfig,
  level = 0,
  passiveRank = 0,
  evolutionStage: number | boolean = 0,
  equipmentItems: Item[] = [],
  duplicates = 0,
  catchUp = 1
): ActiveModifier[] {
  const synergy = activeArc ? synergyMultiplier(character, activeArc, config, evolutionStage) : 1;
  // Outside every world this character calls home, the passive shuts off — only damage still
  // applies, at the (steep) other-anime malus.
  const otherAnime = activeArc ? !isHomeArc(character, activeArc, evolutionStage) : false;
  // Levels, pack duplicates and the story's catch-up ramp all scale the printed base damage.
  const damageGrowth = levelGrowth(level) * duplicateGrowth(duplicates) * catchUp;
  // Rank 1 is the passive as printed; every rank past it deepens it by the usual step.
  const passiveScale = passiveGrowth(passiveRank);

  const contributions: ActiveModifier[] = [
    // Scoped to this character: their own damage is what their own buffs boost.
    {
      sourceId: character.id,
      scope: character.id,
      target: "clickPower",
      kind: "flat",
      value: character.baseClickPower * damageGrowth * synergy,
    },
    {
      sourceId: character.id,
      scope: character.id,
      target: "teamDps",
      kind: "flat",
      value: character.baseDps * damageGrowth * synergy,
    },
  ];

  if (character.passive && passiveRank > 0 && !otherAnime) {
    // Scoped like the character's own damage: a passive is *their* statistic growing, not the team's.
    contributions.push({
      ...scaledEffect(character.passive, passiveScale * synergy),
      sourceId: character.id,
      scope: character.id,
    });
  }

  for (const evolution of unlockedEvolutions(character, evolutionStage)) {
    for (const bonus of evolution.bonus) {
      contributions.push({ ...scaledEffect(bonus, synergy), sourceId: character.id });
    }
  }

  // Equipped unique items are scaled by synergy like the character's own stats, and scoped to the
  // character wearing them: a unique buffs its bearer, never the rest of the team.
  for (const item of equipmentItems) {
    for (const effect of item.effects ?? []) {
      contributions.push({
        ...scaledEffect(effect, synergy),
        sourceId: `${character.id}:equip:${item.id}`,
        scope: character.id,
      });
    }
  }

  return contributions;
}
