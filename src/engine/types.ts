/** Main cast carries a deeper passive than the supporting cast — see PASSIVE_LEVEL_CAP. */
export type Rarity = "main" | "secondary";

export type ModifierTarget = "clickPower" | "teamDps";
export type ModifierKind = "flat" | "percent" | "multiplier";

export interface ModifierTemplate {
  target: ModifierTarget;
  kind: ModifierKind;
  value: number;
}

export interface ActiveModifier extends ModifierTemplate {
  sourceId: string;
  /**
   * The character this modifier applies to, if it isn't team-wide: a character's own base damage,
   * and any ability buff, which only ever boosts the characters it comes from (see
   * `computeScopedStat`). Absent = team-wide, applied to everyone.
   */
  scope?: string;
  /** epoch ms; undefined = lasts as long as its source is active (e.g. an owned character's passive) */
  expiresAt?: number;
}

export interface Anime {
  id: string;
  name: string;
  /** flavour text shown in the world portal; absent only in test fixtures */
  description?: string;
  /**
   * The anime that must be **cleared** before this one can be entered, free travel or paid shortcut
   * alike. This is how a universe keeps its order: Shippuden after part 1, Boruto after Shippuden.
   * Absent means it is an entry point — a world the player may start on.
   */
  requiresAnimeId?: string;
  /**
   * prestige points to enter this anime early, without having finished the current one.
   * The normal route (first pick, or travelling after clearing a world) is always free.
   */
  unlockCost: number;
  /**
   * HSL hue 0..360 driving this world's art direction (see `ui/hue.ts`'s `themeOf`). Absent falls
   * back to `spriteHue(id)`, so an unstyled world stays visually distinct from its neighbours.
   */
  themeHue?: number;
  /**
   * Background art for this world's map panel (a URL under `public/`). The canvas takes the image's
   * own aspect ratio, and arcs are placed with `Arc.mapX`/`mapY` instead of the snake layout.
   */
  mapImage?: string;
}

/** Commons drop from ordinary fights and stack; uniques come from bosses and are one copy only. */
export type ItemKind = "common" | "unique";

/**
 * Found by beating the enemy that holds it, and never lost. Commons are the currency of passives:
 * each arc has its own, and it is the only thing that ranks up the passives of the characters met
 * there. Uniques drop from bosses, one copy only, and are equipped on a character to grant their
 * `effects` permanently — `equippableBy` restricts who may wear one.
 */
export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  /** For uniques: permanent modifiers granted while the item is equipped on a character. */
  effects?: ModifierTemplate[];
  /** For uniques: optional restriction on who can equip it. If absent, anyone can wear it. */
  equippableBy?: EquippableBy;
}

export interface EquippableBy {
  characterIds?: string[];
  animeIds?: string[];
  tags?: string[];
}

export type CharacterTag = string;

/** One readable rule that makes a boss play differently without creating a second combat model. */
export type BossTrait =
  | {
      kind: "click-resistance";
      name: string;
      description: string;
      /** share of narrator-click damage that gets through, 0..1 */
      multiplier: number;
    }
  | {
      kind: "dps-resistance";
      name: string;
      description: string;
      /** share of passive team DPS that gets through, 0..1 */
      multiplier: number;
    }
  | {
      kind: "shield";
      name: string;
      description: string;
      /** extra max hp as a fraction of the boss's printed base hp */
      multiplier: number;
    };

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
  /** data-driven boss rule; production content gives every boss exactly one */
  bossTrait?: BossTrait;
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
  /**
   * Where this arc sits on its world's `mapImage`, as a 0..1 fraction of the image. Absent falls
   * back to the generated snake layout — so a world can be hand-placed arc by arc.
   */
  mapX?: number;
  mapY?: number;
}

export interface Character {
  id: string;
  name: string;
  animeId: string;
  rarity: Rarity;
  /** arcs (within its own anime) this character is strong in */
  arcIds: string[];
  /** later anime where this same character is present, without becoming a second recruit */
  appearanceAnimeIds?: string[];
  /** later anime whose whole arc list is a major part of this character's story */
  fullSynergyAnimeIds?: string[];
  /** click damage at level 0; every level adds `LEVEL_DAMAGE_STEP` times this much again */
  baseClickPower: number;
  /** dps at level 0; every level adds `LEVEL_DAMAGE_STEP` times this much again */
  baseDps: number;
  /** flavor tags used for equipment restrictions (clan, affiliation, role, etc.) */
  tags?: CharacterTag[];
  /** innate bonus granted to the whole run while this character is in the team */
  passive?: ModifierTemplate;
  /** active ability unlocked by having this character alone */
  ability?: AbilityDefinition;
  /** a later, stronger self this same character grows into — not a second character */
  evolution?: CharacterEvolution;
}

export interface AbilityDefinition {
  id: string;
  name: string;
  cooldownMs: number;
  durationMs: number;
  effects: ModifierTemplate[];
}

/**
 * A part-1 character re-encountered further into their own story: unlocked once, by fighting in
 * `animeId` while owned, and permanent from then on — it never re-locks even back in the original
 * world. `bonus` stacks on top of the base stats (scaled by the usual synergy tiers, same as a
 * passive); `ability`, if set, replaces the character's base `ability` outright once evolved.
 */
export interface CharacterEvolution {
  /** the anime whose active arc unlocks this evolution; must require the character's own anime */
  animeId: string;
  /** shown in the Codex as the name of this stronger self, e.g. "Mode Ermite" */
  label: string;
  bonus: ModifierTemplate[];
  ability?: AbilityDefinition;
}

/**
 * A currency purchase offered in the shop panel: either copies of an item or a character.
 * `requiresAnimeId`, if set, gates the offer behind that anime
 * being cleared — otherwise a high `cost` is the only barrier.
 */
export interface ShopOffer {
  id: string;
  kind: "item" | "character";
  /** Item.id or Character.id, matching `kind` */
  targetId: string;
  cost: number;
  /** items only: copies granted per purchase; defaults to 1 */
  amount?: number;
  /** Generated supply offers only: the arc whose common item is being sold. */
  arcId?: string;
  requiresAnimeId?: string;
}

export interface SynergyConfig {
  /** multiplier applied when a character's arcIds include the active arc */
  matchingArcMultiplier: number;
  /** multiplier applied when the character is from the active arc's anime, but not that arc */
  sameAnimeMalus: number;
  /** multiplier applied when the character is from a different anime entirely */
  otherAnimeMalus: number;
}
