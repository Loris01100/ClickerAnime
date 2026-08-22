import { levelGrowth } from "./growth";
import type { ActiveModifier, Arc, Character, SynergyConfig } from "./types";

export const defaultSynergyConfig: SynergyConfig = {
  matchingArcMultiplier: 1.0,
  sameAnimeMalus: 0.75,
  otherAnimeMalus: 0.4,
};

/**
 * A character is strongest in the arcs listed in `arcIds`, weaker elsewhere in the
 * same anime (different arc of their own story), and weakest when the active arc
 * belongs to an entirely different anime.
 */
export function synergyMultiplier(character: Character, activeArc: Arc, config: SynergyConfig): number {
  if (character.arcIds.includes(activeArc.id)) return config.matchingArcMultiplier;
  if (character.animeId === activeArc.animeId) return config.sameAnimeMalus;
  return config.otherAnimeMalus;
}

/**
 * Converts one owned character's stats + passive into modifiers, pre-scaled by their synergy with
 * the currently active arc. Damage grows with every level; the passive is driven by `passiveRank`
 * instead — copies of the origin item, see `passiveRank` — and is absent while still locked, or
 * while fighting in a different anime entirely (the passive is a story ability, it doesn't travel).
 */
export function characterContributions(
  character: Character,
  activeArc: Arc | null,
  config: SynergyConfig = defaultSynergyConfig,
  level = 0,
  passiveRank = 0
): ActiveModifier[] {
  const synergy = activeArc ? synergyMultiplier(character, activeArc, config) : 1;
  // Outside the character's own anime entirely, the passive shuts off — only damage still applies,
  // at the (steep) other-anime malus.
  const otherAnime = activeArc ? character.animeId !== activeArc.animeId : false;
  const damageGrowth = levelGrowth(level);
  // Rank 1 is the passive as printed; every rank past it deepens it by the usual step.
  const passiveGrowth = levelGrowth(passiveRank - 1);

  const contributions: ActiveModifier[] = [
    {
      id: `${character.id}:base-click`,
      sourceId: character.id,
      target: "clickPower",
      kind: "flat",
      value: character.baseClickPower * damageGrowth * synergy,
    },
    {
      id: `${character.id}:base-dps`,
      sourceId: character.id,
      target: "teamDps",
      kind: "flat",
      value: character.baseDps * damageGrowth * synergy,
    },
  ];

  if (character.passive && passiveRank > 0 && !otherAnime) {
    contributions.push({
      ...character.passive,
      sourceId: character.id,
      value: character.passive.value * passiveGrowth * synergy,
    });
  }

  return contributions;
}
