import type { AbilityPolicy } from "./abilities";
import type { ActiveModifier, SynergyConfig } from "./types";

/** Six independent chains the prestige points feed. */
export type PrestigeTreeCategoryId = "narratorClick" | "teamDps" | "xp" | "items" | "destin" | "automation";

export interface PrestigeTreeNode {
  /** 1-indexed position of this node within its branch's chain */
  position: number;
  label: string;
  /** what ONE level of this node does — the same text applies at every level, the effect just repeats */
  description: string;
}

export interface PrestigeTreeCategory {
  id: PrestigeTreeCategoryId;
  label: string;
  /** exactly 5 nodes, position 1..5, index 0..4 */
  nodes: PrestigeTreeNode[];
}

export const LEVELS_PER_NODE = 5;

/** Cost of level 1..5 of ANY node — reused identically inside every node, ~1.6x growth like `passiveRankCost`. */
export const LEVEL_COSTS = [2, 3, 5, 8, 13];

/** A branch's 5 nodes, each maxed at LEVELS_PER_NODE — the ceiling on its total, for the header readout. */
export const LEVELS_PER_BRANCH = LEVELS_PER_NODE * 5;

/** Clamp shared by every discount-style effect, so a high level can never push a cost to zero or below. */
const MAX_DISCOUNT = 0.9;
/** Floor for the xp curve's growth constant — it must stay above 1 or the geometric curve breaks. */
export const MIN_XP_GROWTH = 1.02;

// --- effect magnitudes: what ONE level of each node is worth; levels stack additively ---

export const NARRATOR_CLICK_PERCENT = 0.08;
/**
 * The autoclicker always fires at the narrator's *full* click power; what its levels buy is
 * **cadence**, not strength. Level 1 clicks every 2s and each level above shaves
 * `AUTOCLICK_INTERVAL_REDUCTION_MS`, down to 0.8s at level 5 — see `autoClickIntervalMs`.
 * (It used to be the other way round: a fixed 2s at a level-scaled *fraction* of click power,
 * which made the first level feel like nothing and never changed the rhythm of the fight.)
 */
export const AUTOCLICK_INTERVAL_MS = 2_000;
export const AUTOCLICK_INTERVAL_REDUCTION_MS = 300;

/**
 * The curve every "it happens by itself, this often" node shares: `baseMs` at level 1, shortened by
 * `reductionMs` per level above, 0 when the node isn't bought at all. Same class of trap as
 * `scaledChance`: a reduction big enough to eat the whole base would make a maxed node fire at 0ms
 * — i.e. every tick — so `reductionMs * (LEVELS_PER_NODE - 1)` must stay under `baseMs`, which
 * `src/engine/tests/` asserts for every pair below.
 */
function cadenceMs(baseMs: number, reductionMs: number, level: number): number {
  return level <= 0 ? 0 : baseMs - reductionMs * (level - 1);
}

/** Milliseconds between two automatic clicks at this node level; 0 when the node isn't bought. */
export function autoClickIntervalMs(level: number): number {
  return cadenceMs(AUTOCLICK_INTERVAL_MS, AUTOCLICK_INTERVAL_REDUCTION_MS, level);
}
export const CRIT_CHANCE = 0.15;
export const CRIT_MULTIPLIER = 3;
export const CLICK_COOLDOWN_REDUCTION_MS = 100;
export const FREE_ABILITY_TRIGGER_CHANCE = 0.05;

export const TEAM_DPS_PERCENT = 0.08;
export const ABILITY_DAMAGE_BOOST = 0.2;
/** Narrows the gap between a malus and 1.0 by this fraction per level; never pushes past 1.0. */
export const SYNERGY_MALUS_SOFTEN = 0.3;
export const ABILITY_DURATION_BOOST = 0.25;
export const BOSS_TIMER_BOOST = 0.3;

export const XP_GAIN_PERCENT = 0.10;
export const XP_PASSIVE_PER_SECOND = 1;
export const XP_GROWTH_REDUCTION = 0.01;
export const RECRUIT_XP_BONUS = 250;
export const BOSS_XP_BOOST = 0.2;

export const DROP_CHANCE_BOOST = 0.2;
export const PASSIVE_RANK_DISCOUNT = 0.15;
/**
 * A "chance" node must still be a chance at level 5, never a guarantee: `scaledChance` clamps
 * `base * level` at 1, which silently turned 0.25 into "always double" at max level and took the
 * effective common-drop rate from 12% to 48% per kill on its own. Keep every chance constant
 * strictly under 1/5 — `src/engine/tests/` asserts it for all of them.
 */
export const DOUBLE_DROP_CHANCE = 0.08;
export const PITY_KILLS_THRESHOLD = 15;
/**
 * Kills shaved off the pity threshold per level above 1. At 3 the max level forced a common every
 * 3 kills — a 33% floor, nearly 3x the printed base chance, and the second big reason commons
 * poured in. At 1 the floor is a common every 11 kills, which is a safety net rather than a source.
 */
export const PITY_REDUCTION_PER_LEVEL = 1;
export const GHOST_LOOT_CHANCE = 0.05;

export const CURRENCY_GAIN_PERCENT = 0.05;
export const PRESTIGE_PER_KILL_CHANCE = 0.0001;
export const AUSPICE_DOUBLE_DROP_CHANCE = 0.05;
export const SHOP_COST_DISCOUNT = 0.06;
/**
 * "Carte blanche": the chance that an opened pack is on the house — its points are simply not
 * spent. Under 1/5 like every chance constant, and deliberately the branch's only node that pays in
 * something other than the main currency: pack points were the one resource the whole tree ignored.
 *
 * It is also the reason this node replaced the old "Faveur du destin" (a chance to double the
 * points a reset banked). That one resolved a coin flip once per run, at the one moment the player
 * has nothing left to decide, and multiplied the very gain `PRESTIGE_EXPONENT` is tuned to keep
 * flat — a maxed node was worth a whole extra run every ten resets, felt as pure variance. This one
 * pays inside the loop the player is actually playing, and it cannot raise any ceiling: a pack still
 * has to be affordable to be opened, and `MAX_DUPLICATES` still closes the pool. It buys pace.
 */
export const FREE_PACK_CHANCE = 0.08;

// --- "Automatisation": the branch that plays the parts of the loop that aren't decisions ---
//
// Every node here automates something the player can already do by hand, and **only** that: not one
// of them grants damage, currency or xp, so the branch moves no balance constant. What its levels
// buy is either *cadence* (how long the game waits before doing it for you, like the autoclicker's)
// or *scope* (how many characters the intendance looks after) — never strength.

export const AUTO_ADVANCE_DELAY_MS = 10_000;
export const AUTO_ADVANCE_REDUCTION_MS = 2_000;
export const AUTO_ABILITY_INTERVAL_MS = 10_000;
export const AUTO_ABILITY_REDUCTION_MS = 2_000;
export const AUTO_REMATCH_DELAY_MS = 15_000;
export const AUTO_REMATCH_REDUCTION_MS = 3_000;
/** Characters the intendance can look after per level — one more passive ranked for you each time. */
export const AUTO_RANK_SLOTS_PER_LEVEL = 1;

/** How long after clearing an arc the team walks on to the next one; 0 when the node isn't bought. */
export function autoAdvanceDelayMs(level: number): number {
  return cadenceMs(AUTO_ADVANCE_DELAY_MS, AUTO_ADVANCE_REDUCTION_MS, level);
}

/** How often ready abilities are fired for the player; 0 when the node isn't bought. */
export function autoAbilityIntervalMs(level: number): number {
  return cadenceMs(AUTO_ABILITY_INTERVAL_MS, AUTO_ABILITY_REDUCTION_MS, level);
}

/** How long after a boss timeout the rematch is asked for; 0 when the node isn't bought. */
export function autoRematchDelayMs(level: number): number {
  return cadenceMs(AUTO_REMATCH_DELAY_MS, AUTO_REMATCH_REDUCTION_MS, level);
}

/** How many characters may be handed to the intendance at once; 0 when the node isn't bought. */
export function autoRankSlots(level: number): number {
  return Math.max(0, level) * AUTO_RANK_SLOTS_PER_LEVEL;
}

/**
 * Crystals the automatic crossover refuses to dip into, so a bought-and-forgotten node can't drain
 * a stock the player was saving for a deliberate window. Level 1 holds back four activations' worth
 * and each level frees one, down to nothing at level 5 — the reserve *is* this node's level effect.
 */
export function autoCrossoverReserve(level: number, cost: number): number {
  return Math.max(0, LEVELS_PER_NODE - level) * cost;
}

/**
 * What "Réflexe" lets the player *plan*, level by level. Pure scope, like every other level in this
 * branch: a plan can only make the automation hold an ability back, never make one worth more.
 * Level 1 fires everything as soon as it's ready; level 2 opens "Boss"; level 3 opens "Groupe".
 */
export function abilityPolicyChoices(level: number): AbilityPolicy[] {
  if (level <= 0) return [];
  const choices: AbilityPolicy[] = ["always"];
  if (level >= 2) choices.push("boss");
  if (level >= 3) choices.push("sync");
  return choices;
}

/** The five automations, each reading the level of its own node in the "Automatisation" branch. */
export type AutomationKey = "advance" | "ability" | "rank" | "rematch" | "crossover";

/** Position of each automation's node — the toggles and the tick read the same level as the tree. */
export const AUTOMATION_POSITIONS: Record<AutomationKey, number> = {
  advance: 1,
  ability: 2,
  rank: 3,
  rematch: 4,
  crossover: 5,
};

export const AUTOMATION_KEYS = Object.keys(AUTOMATION_POSITIONS) as AutomationKey[];

/** Shared by every chance-based effect so `base * level` can never exceed certainty. */
export function scaledChance(base: number, level: number): number {
  return Math.min(1, base * level);
}

/** Shared by every discount-style effect (cost reduction), clamped so a cost never hits zero. */
export function scaledDiscount(base: number, level: number): number {
  return Math.min(MAX_DISCOUNT, base * level);
}

/** Seconds, written the French way — 2s, 0,8s — for the node descriptions. */
const secs = (ms: number) => `${String(ms / 1000).replace(".", ",")}s`;

const pct = (value: number) => {
  const percent = value * 100;
  return Number.isInteger(percent) ? `${Math.round(percent)}%` : `${percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
};

export const PRESTIGE_TREE_CATEGORIES: PrestigeTreeCategory[] = [
  {
    id: "narratorClick",
    label: "Clic du Narrateur",
    nodes: [
      {
        position: 1,
        label: "Frappe affûtée",
        description: `+${pct(NARRATOR_CLICK_PERCENT)} de dégâts au clic`,
      },
      {
        position: 2,
        label: "Écho du clic",
        description:
          `Un clic automatique à 100% de la puissance de clic, toutes les ${secs(AUTOCLICK_INTERVAL_MS)} — ` +
          `${secs(AUTOCLICK_INTERVAL_REDUCTION_MS)} de moins par niveau, jusqu'à ${secs(autoClickIntervalMs(LEVELS_PER_NODE))}`,
      },
      {
        position: 3,
        label: "Instinct critique",
        description: `+${pct(CRIT_CHANCE)} de chance qu'un clic inflige x${CRIT_MULTIPLIER} dégâts`,
      },
      {
        position: 4,
        label: "Cadence",
        description: `Chaque clic réduit le temps de recharge des capacités de ${CLICK_COOLDOWN_REDUCTION_MS}ms`,
      },
      {
        position: 5,
        label: "Étincelle narrative",
        description: `+${pct(FREE_ABILITY_TRIGGER_CHANCE)} de chance qu'un clic déclenche gratuitement une capacité débloquée`,
      },
    ],
  },
  {
    id: "teamDps",
    label: "DPS Équipe",
    nodes: [
      {
        position: 1,
        label: "Force du collectif",
        description: `+${pct(TEAM_DPS_PERCENT)} de dégâts DPS équipe`,
      },
      {
        position: 2,
        label: "Techniques affûtées",
        description: `+${pct(ABILITY_DAMAGE_BOOST)} sur les effets des capacités actives`,
      },
      {
        position: 3,
        label: "Cohésion inter-mondes",
        description: "Adoucit un peu plus les malus de synergie hors de l'arc actif",
      },
      {
        position: 4,
        label: "Endurance",
        description: `+${pct(ABILITY_DURATION_BOOST)} de durée sur les buffs de capacités`,
      },
      {
        position: 5,
        label: "Siège prolongé",
        description: `+${pct(BOSS_TIMER_BOOST)} de temps avant qu'un boss ne se réinitialise`,
      },
    ],
  },
  {
    id: "xp",
    label: "XP",
    nodes: [
      {
        position: 1,
        label: "Apprentissage",
        description: `+${pct(XP_GAIN_PERCENT)} d'XP gagnée par kill`,
      },
      {
        position: 2,
        label: "Entraînement continu",
        description: `+${XP_PASSIVE_PER_SECOND} XP/s pour toute l'équipe, même hors combat`,
      },
      {
        position: 3,
        label: "Courbe adoucie",
        description: "Réduit un peu plus la pente de la courbe de niveau",
      },
      {
        position: 4,
        label: "Rattrapage",
        description: `Un nouveau recrutement démarre avec ${RECRUIT_XP_BONUS} XP de plus`,
      },
      {
        position: 5,
        label: "Leçon du boss",
        description: `+${pct(BOSS_XP_BOOST)} d'XP sur les kills de boss`,
      },
    ],
  },
  {
    id: "items",
    label: "Objets",
    nodes: [
      {
        position: 1,
        label: "Œil aiguisé",
        description: `+${pct(DROP_CHANCE_BOOST)} de taux de drop des objets communs`,
      },
      {
        position: 2,
        label: "Artisanat",
        description: `-${pct(PASSIVE_RANK_DISCOUNT)} de copies requises pour ranker un passif`,
      },
      {
        position: 3,
        label: "Aubaine",
        description: `+${pct(DOUBLE_DROP_CHANCE)} de chance de récupérer deux exemplaires au lieu d'un`,
      },
      {
        position: 4,
        label: "Pisteur",
        description: `Réduit de ${PITY_REDUCTION_PER_LEVEL} kills le palier garantissant un objet commun`,
      },
      {
        position: 5,
        label: "Fouille approfondie",
        description: `+${pct(GHOST_LOOT_CHANCE)} de chance qu'un ennemi sans objet en lâche quand même un`,
      },
    ],
  },
  {
    id: "destin",
    label: "Destin",
    nodes: [
      {
        position: 1,
        label: "Sens du commerce",
        description: `+${pct(CURRENCY_GAIN_PERCENT)} de monnaie gagnée par kill`,
      },
      {
        position: 2,
        label: "Porte-bonheur",
        description: `+${pct(PRESTIGE_PER_KILL_CHANCE)} de chance de gagner 1 point de prestige par kill`,
      },
      {
        position: 3,
        label: "Auspice",
        description: `+${pct(AUSPICE_DOUBLE_DROP_CHANCE)} de chance de récupérer deux exemplaires d'un objet commun au lieu d'un`,
      },
      {
        position: 4,
        label: "Relations",
        description: `-${pct(SHOP_COST_DISCOUNT)} sur les prix de la boutique`,
      },
      {
        position: 5,
        label: "Carte blanche",
        description: `+${pct(FREE_PACK_CHANCE)} de chance qu'un pack ouvert soit offert : ses points ne sont pas dépensés`,
      },
    ],
  },
  {
    id: "automation",
    label: "Automatisation",
    nodes: [
      {
        position: 1,
        label: "Relève",
        description:
          `L'équipe enchaîne sur l'arc suivant ${secs(AUTO_ADVANCE_DELAY_MS)} après avoir terminé le sien — ` +
          `${secs(AUTO_ADVANCE_REDUCTION_MS)} de moins par niveau, jusqu'à ${secs(autoAdvanceDelayMs(LEVELS_PER_NODE))}`,
      },
      {
        position: 2,
        label: "Réflexe",
        description:
          `Déclenche seul les capacités prêtes, toutes les ${secs(AUTO_ABILITY_INTERVAL_MS)} — ` +
          `${secs(AUTO_ABILITY_REDUCTION_MS)} de moins par niveau, jusqu'à ${secs(autoAbilityIntervalMs(LEVELS_PER_NODE))}. ` +
          `Niveau 2 : chaque capacité peut être réservée aux boss. Niveau 3 : on peut en grouper ` +
          `plusieurs, lancées ensemble une fois toutes prêtes`,
      },
      {
        position: 3,
        label: "Intendance",
        description:
          `Monte tout seul le passif d'un personnage confié à l'intendance — ` +
          `+${AUTO_RANK_SLOTS_PER_LEVEL} personnage par niveau, jusqu'à ${autoRankSlots(LEVELS_PER_NODE)}`,
      },
      {
        position: 4,
        label: "Second souffle",
        description:
          `Après un échec au chrono, retente le boss dès que l'équipe peut le battre — vérifié ` +
          `toutes les ${secs(AUTO_REMATCH_DELAY_MS)}, ${secs(AUTO_REMATCH_REDUCTION_MS)} de moins ` +
          `par niveau, jusqu'à ${secs(autoRematchDelayMs(LEVELS_PER_NODE))}`,
      },
      {
        position: 5,
        label: "Instinct de crossover",
        description:
          `Active un crossover dès qu'il est conseillé, en gardant ${LEVELS_PER_NODE - 1} activations ` +
          `de réserve — 1 de moins par niveau, jusqu'à 0`,
      },
    ],
  },
];

/**
 * A branch's 5 node levels (0..5 each), one entry per position — the shape persisted per branch.
 *
 * `categoryId` is the branch's own union, not a `string`: the ranks are a `Record<string, number[]>`
 * (they come off a save file), so a misspelt branch answers `[0,0,0,0,0]` forever — a node that
 * silently does nothing, with nothing to see in the UI and no test to fail. Same reasoning as
 * `AchievementId` in `achievements.ts`.
 */
export function nodeLevels(ranks: Record<string, number[]>, categoryId: PrestigeTreeCategoryId): number[] {
  return ranks[categoryId] ?? [0, 0, 0, 0, 0];
}

export function nodeLevel(levels: number[], position: number): number {
  return levels[position - 1] ?? 0;
}

/** Total levels bought across the branch (0..25), for the header readout. */
export function totalLevels(levels: number[]): number {
  return levels.reduce((sum, level) => sum + level, 0);
}

/** A node unlocks once its predecessor has at least one level bought; node 1 is always unlocked. */
export function isNodeUnlocked(levels: number[], position: number): boolean {
  return position === 1 || nodeLevel(levels, position - 1) >= 1;
}

/** What the next level of this node costs, or null if it's locked or already maxed. */
export function nodeCost(levels: number[], position: number): number | null {
  if (!isNodeUnlocked(levels, position)) return null;
  const level = nodeLevel(levels, position);
  return level >= LEVELS_PER_NODE ? null : LEVEL_COSTS[level];
}

export function canPurchaseNodeLevel(
  prestigePoints: number,
  ranks: Record<string, number[]>,
  category: PrestigeTreeCategory,
  position: number
): boolean {
  const cost = nodeCost(nodeLevels(ranks, category.id), position);
  return cost !== null && prestigePoints >= cost;
}

export interface TreePurchaseResult {
  prestigePoints: number;
  ranks: Record<string, number[]>;
}

/**
 * Buys the next level of one specific node — unlike a branch's overall shape, nodes don't have to
 * be bought in strict position order past the first level: once a node is unlocked (its
 * predecessor has ≥1 level), it stays purchasable in any order the player likes relative to its
 * siblings, only its own 5 levels are sequential.
 */
export function purchaseNodeLevel(
  prestigePoints: number,
  ranks: Record<string, number[]>,
  category: PrestigeTreeCategory,
  position: number
): TreePurchaseResult | null {
  const levels = nodeLevels(ranks, category.id);
  const cost = nodeCost(levels, position);
  if (cost === null || prestigePoints < cost) return null;
  const nextLevels = [...levels];
  nextLevels[position - 1] = nodeLevel(levels, position) + 1;
  return { prestigePoints: prestigePoints - cost, ranks: { ...ranks, [category.id]: nextLevels } };
}

/** Narrows a synergy config's malus toward 1.0 by `SYNERGY_MALUS_SOFTEN * level`; never past it. */
export function softenedSynergyConfig(config: SynergyConfig, level: number): SynergyConfig {
  if (level <= 0) return config;
  const fraction = scaledChance(SYNERGY_MALUS_SOFTEN, level);
  return {
    matchingArcMultiplier: config.matchingArcMultiplier,
    sameAnimeMalus: config.sameAnimeMalus + (1 - config.sameAnimeMalus) * fraction,
    otherAnimeMalus: config.otherAnimeMalus + (1 - config.otherAnimeMalus) * fraction,
  };
}

/** Permanent, run-independent modifiers from the two branches whose node 1 is a flat stat percent. */
export function prestigeTreeContributions(ranks: Record<string, number[]>): ActiveModifier[] {
  const mods: ActiveModifier[] = [];
  const narratorLevel = nodeLevel(nodeLevels(ranks, "narratorClick"), 1);
  if (narratorLevel > 0) {
    mods.push({
      sourceId: "prestige-tree:narratorClick:1",
      target: "clickPower",
      kind: "percent",
      value: NARRATOR_CLICK_PERCENT * narratorLevel,
    });
  }
  const teamDpsLevel = nodeLevel(nodeLevels(ranks, "teamDps"), 1);
  if (teamDpsLevel > 0) {
    mods.push({
      sourceId: "prestige-tree:teamDps:1",
      target: "teamDps",
      kind: "percent",
      value: TEAM_DPS_PERCENT * teamDpsLevel,
    });
  }
  return mods;
}
