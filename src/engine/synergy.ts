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
 * Converts one owned character's stats + passive into modifiers, pre-scaled by their synergy with
 * the currently active arc. Damage grows with every level; the passive is driven by `passiveRank`
 * instead — copies of the origin item, see `passiveRank` — and is absent while still locked, or
 * while fighting in a different anime entirely (the passive is a story ability, it doesn't travel) —
 * unless `evolved` and that anime is the character's evolution, which counts as home. An evolved
 * character also adds `evolution.bonus`, scaled the same way as the passive. `duplicates` are the
 * pack copies held of this character (see packs.ts) — they multiply the base damage, uncapped.
 */
export function characterContributions(
  character: Character,
  activeArc: Arc | null,
  config: SynergyConfig = defaultSynergyConfig,
  level = 0,
  passiveRank = 0,
  evolved = false,
  equipmentItems: Item[] = [],
  duplicates = 0
): ActiveModifier[] {
  const synergy = activeArc ? synergyMultiplier(character, activeArc, config, evolved) : 1;
  const isHome = (arc: Arc) =>
    character.animeId === arc.animeId || (evolved && character.evolution?.animeId === arc.animeId);
  // Outside every world this character calls home, the passive shuts off — only damage still
  // applies, at the (steep) other-anime malus.
  const otherAnime = activeArc ? !isHome(activeArc) : false;
  // Levels and pack duplicates both scale the printed base damage, and stack with each other.
  const damageGrowth = levelGrowth(level) * duplicateGrowth(duplicates);
  // Rank 1 is the passive as printed; every rank past it deepens it by the usual step.
  const passiveScale = passiveGrowth(passiveRank);

  const contributions: ActiveModifier[] = [
    // Scoped to this character: their own damage is what their (and their combos') buffs boost.
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
    contributions.push({
      ...character.passive,
      sourceId: character.id,
      value: character.passive.value * passiveScale * synergy,
    });
  }

  if (evolved && character.evolution) {
    for (const bonus of character.evolution.bonus) {
      contributions.push({ ...bonus, sourceId: character.id, value: bonus.value * synergy });
    }
  }

  // Equipped unique items are scaled by synergy like the character's own stats.
  for (const item of equipmentItems) {
    for (const effect of item.effects ?? []) {
      contributions.push({
        ...effect,
        sourceId: `${character.id}:equip:${item.id}`,
        value: effect.value * synergy,
      });
    }
  }

  return contributions;
}
