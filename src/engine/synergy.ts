import { levelGrowth, passiveLevel } from "./growth";
import type { ActiveModifier, Arc, Character, SynergyConfig } from "./types";

export const defaultSynergyConfig: SynergyConfig = {
  matchingArcMultiplier: 1.5,
  sameAnimeMalus: 0.85,
  otherAnimeMalus: 0.5,
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
 * the currently active arc and by their level. Damage grows with every level; the passive stops
 * growing at the cap for their rarity.
 */
export function characterContributions(
  character: Character,
  activeArc: Arc | null,
  config: SynergyConfig = defaultSynergyConfig,
  level = 0
): ActiveModifier[] {
  const synergy = activeArc ? synergyMultiplier(character, activeArc, config) : 1;
  const damageGrowth = levelGrowth(level);
  const passiveGrowth = levelGrowth(passiveLevel(level, character.rarity));

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

  if (character.passive) {
    contributions.push({
      ...character.passive,
      sourceId: character.id,
      value: character.passive.value * passiveGrowth * synergy,
    });
  }

  return contributions;
}
