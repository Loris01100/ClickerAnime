import { levelGrowth, passiveGrowth } from "./growth";
import { duplicateGrowth } from "./packs";
import type { ActiveModifier, Arc, Character, Item, SynergyConfig } from "./types";

export const defaultSynergyConfig: SynergyConfig = {
  matchingArcMultiplier: 1.0,
  sameAnimeMalus: 0.85,
  otherAnimeMalus: 0.5,
};

/**
 * A character is strongest in the arcs listed in `arcIds`, weaker elsewhere in the same anime
 * (different arc of their own story), and weakest when the active arc belongs to an entirely
 * different anime — unless that anime is the one their evolution grows into, and they've grown
 * into it (`evolved`): that world counts as home too, same as any other arc of their own anime.
 */
export function synergyMultiplier(
  character: Character,
  activeArc: Arc,
  config: SynergyConfig,
  evolved = false
): number {
  if (character.arcIds.includes(activeArc.id)) return config.matchingArcMultiplier;
  if (character.animeId === activeArc.animeId) return config.sameAnimeMalus;
  if (evolved && character.evolution?.animeId === activeArc.animeId) return config.sameAnimeMalus;
  return config.otherAnimeMalus;
}

/**
 * Whether this arc is one the character calls home: an arc of their own anime, or of the anime their
 * evolution grows into once they've grown into it. Anything else is the "different world entirely"
 * tier — `otherAnimeMalus` on damage, and no passive and no ability at all (see
 * `characterContributions` and `getUnlockedAbilities`). One definition, because those three rules
 * have to agree: a character weakened for being abroad is exactly a character whose story abilities
 * stay behind.
 */
export function isHomeArc(character: Character, arc: Arc, evolved = false): boolean {
  return character.animeId === arc.animeId || (evolved && character.evolution?.animeId === arc.animeId);
}

/**
 * Converts one owned character's stats + passive into modifiers, pre-scaled by their synergy with
 * the currently active arc. Damage grows with every level; the passive is driven by `passiveRank`
 * instead — copies of the origin item, see `passiveRank` — and is absent while still locked, or
 * while fighting in a different anime entirely (the passive is a story ability, it doesn't travel) —
 * unless `evolved` and that anime is the character's evolution, which counts as home. An evolved
 * character also adds `evolution.bonus`, scaled the same way as the passive. `duplicates` are the
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
  evolved = false,
  equipmentItems: Item[] = [],
  duplicates = 0,
  catchUp = 1
): ActiveModifier[] {
  const synergy = activeArc ? synergyMultiplier(character, activeArc, config, evolved) : 1;
  // Outside every world this character calls home, the passive shuts off — only damage still
  // applies, at the (steep) other-anime malus.
  const otherAnime = activeArc ? !isHomeArc(character, activeArc, evolved) : false;
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
      ...character.passive,
      sourceId: character.id,
      scope: character.id,
      value: character.passive.value * passiveScale * synergy,
    });
  }

  if (evolved && character.evolution) {
    for (const bonus of character.evolution.bonus) {
      contributions.push({ ...bonus, sourceId: character.id, value: bonus.value * synergy });
    }
  }

  // Equipped unique items are scaled by synergy like the character's own stats, and scoped to the
  // character wearing them: a unique buffs its bearer, never the rest of the team.
  for (const item of equipmentItems) {
    for (const effect of item.effects ?? []) {
      contributions.push({
        ...effect,
        sourceId: `${character.id}:equip:${item.id}`,
        scope: character.id,
        value: effect.value * synergy,
      });
    }
  }

  return contributions;
}
