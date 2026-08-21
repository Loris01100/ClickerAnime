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
 * Converts one owned character's base stats + passive into modifiers, pre-scaled by
 * their synergy with the currently active arc.
 */
export function characterContributions(
  character: Character,
  activeArc: Arc | null,
  config: SynergyConfig = defaultSynergyConfig
): ActiveModifier[] {
  const synergy = activeArc ? synergyMultiplier(character, activeArc, config) : 1;

  const contributions: ActiveModifier[] = [
    {
      id: `${character.id}:base-click`,
      sourceId: character.id,
      target: "clickPower",
      kind: "flat",
      value: character.baseClickPower * synergy,
    },
    {
      id: `${character.id}:base-passive`,
      sourceId: character.id,
      target: "passiveIncome",
      kind: "flat",
      value: character.basePassiveIncome * synergy,
    },
  ];

  if (character.passive) {
    contributions.push({
      ...character.passive,
      sourceId: character.id,
      value: character.passive.value * synergy,
    });
  }

  return contributions;
}
