export type ModifierTarget = "clickPower" | "passiveIncome";
export type ModifierKind = "flat" | "percent" | "multiplier";

export interface ModifierTemplate {
  id: string;
  target: ModifierTarget;
  kind: ModifierKind;
  value: number;
}

export interface ActiveModifier extends ModifierTemplate {
  sourceId: string;
  /** epoch ms; undefined = lasts as long as its source is active (e.g. an owned character's passive) */
  expiresAt?: number;
}

export interface Anime {
  id: string;
  name: string;
  /**
   * prestige points to enter this anime early, without having finished the current one.
   * The normal route (first pick, or travelling after clearing a world) is always free.
   */
  unlockCost: number;
}

export interface Arc {
  id: string;
  animeId: string;
  name: string;
  /** position inside its anime; an arc opens only once the previous one is cleared */
  order: number;
  /** currency that must be earned while this arc is active to clear it, before difficulty scaling */
  baseGoal: number;
}

export interface Character {
  id: string;
  name: string;
  animeId: string;
  /** arcs (within its own anime) this character is strong in */
  arcIds: string[];
  baseClickPower: number;
  basePassiveIncome: number;
  /** innate bonus granted to the whole run while this character is owned */
  passive?: ModifierTemplate;
  /** active ability unlocked by owning this character alone */
  ability?: AbilityDefinition;
}

export interface AbilityDefinition {
  id: string;
  name: string;
  cooldownMs: number;
  durationMs: number;
  effects: ModifierTemplate[];
}

export interface ComboDefinition {
  id: string;
  name: string;
  requiredCharacterIds: string[];
  ability: AbilityDefinition;
}

export interface SynergyConfig {
  /** multiplier applied when a character's arcIds include the active arc */
  matchingArcMultiplier: number;
  /** multiplier applied when the character is from the active arc's anime, but not that arc */
  sameAnimeMalus: number;
  /** multiplier applied when the character is from a different anime entirely */
  otherAnimeMalus: number;
}
