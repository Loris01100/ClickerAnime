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
  /** prestige points required to unlock this anime's roster; 0 = available from the start */
  unlockCost: number;
}

export interface Arc {
  id: string;
  animeId: string;
  name: string;
  order: number;
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
