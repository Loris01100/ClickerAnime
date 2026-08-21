/** Main cast carries a deeper passive than the supporting cast — see PASSIVE_LEVEL_CAP. */
export type Rarity = "main" | "secondary";

export type ModifierTarget = "clickPower" | "teamDps";
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

/** Commons drop from ordinary fights and stack; uniques come from bosses and are one copy only. */
export type ItemKind = "common" | "unique";

/**
 * Found by beating the enemy that holds it, and never lost. Commons are the currency of passives:
 * each arc has its own, and it is the only thing that ranks up the passives of the characters met
 * there. Uniques drop from bosses and do nothing yet — on hold until they get their own idea.
 */
export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
}

/** Anything the player fights. Enemies never deal damage — they only have to fall. */
export interface Enemy {
  id: string;
  name: string;
  /** hit points before the anime's difficulty scaling is applied */
  baseHp: number;
  /** currency granted on defeat, before difficulty scaling */
  reward: number;
  /** defeating this enemy recruits that character into the team, for free */
  characterId?: string;
  /** the item this enemy can hand over */
  itemId?: string;
  /** odds of that drop, 0..1; absent means guaranteed, which is how bosses hand out their unique */
  dropChance?: number;
  /** must be defeated within this window or it comes back at full hp; bosses only, by default */
  timerMs?: number;
}

export interface Arc {
  id: string;
  animeId: string;
  name: string;
  /** position inside its anime; an arc opens only once the previous one is cleared */
  order: number;
  /** the farm pool, cycled in order; entries with a characterId show up once, until recruited */
  mobs: Enemy[];
  /** how many mobs must fall before the boss shows up */
  mobsToBoss: number;
  /** defeating it clears the arc; after that the zone goes back to endless mob farming */
  boss: Enemy;
}

export interface Character {
  id: string;
  name: string;
  animeId: string;
  rarity: Rarity;
  /** arcs (within its own anime) this character is strong in */
  arcIds: string[];
  /** click damage at level 0; every level adds this much again */
  baseClickPower: number;
  /** dps at level 0; every level adds this much again */
  baseDps: number;
  /** innate bonus granted to the whole run while this character is in the team */
  passive?: ModifierTemplate;
  /** active ability unlocked by having this character alone */
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
