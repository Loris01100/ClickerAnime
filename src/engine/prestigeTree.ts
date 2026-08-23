import type { ActiveModifier, SynergyConfig } from "./types";

/**
 * Five independent chains the prestige points feed — the limit `replaceModifiersByTarget` mentions
 * is a separate, still-open idea; this sticks to the five branches as designed.
 */
export type PrestigeTreeCategoryId = "narratorClick" | "teamDps" | "xp" | "items" | "resource";

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
export const AUTOCLICK_INTERVAL_MS = 2_000;
export const AUTOCLICK_POWER_FRACTION = 0.2;
export const CRIT_CHANCE = 0.15;
export const CRIT_MULTIPLIER = 3;
export const CLICK_COOLDOWN_REDUCTION_MS = 300;
export const FREE_ABILITY_TRIGGER_CHANCE = 0.05;

export const TEAM_DPS_PERCENT = 0.08;
export const ABILITY_DAMAGE_BOOST = 0.2;
/** Narrows the gap between a malus and 1.0 by this fraction per level; never pushes past 1.0. */
export const SYNERGY_MALUS_SOFTEN = 0.3;
export const ABILITY_DURATION_BOOST = 0.25;
export const BOSS_TIMER_BOOST = 0.3;

export const XP_GAIN_PERCENT = 0.15;
export const XP_PASSIVE_PER_SECOND = 1;
export const XP_GROWTH_REDUCTION = 0.03;
export const RECRUIT_XP_BONUS = 500;
export const BOSS_XP_BOOST = 0.5;

export const DROP_CHANCE_BOOST = 0.2;
export const PASSIVE_RANK_DISCOUNT = 0.15;
export const DOUBLE_DROP_CHANCE = 0.25;
export const PITY_KILLS_THRESHOLD = 15;
/** Kills shaved off the pity threshold per level above 1; the threshold bottoms out at level 5. */
export const PITY_REDUCTION_PER_LEVEL = 3;
export const GHOST_LOOT_CHANCE = 0.05;

export const CURRENCY_GAIN_PERCENT = 0.15;
export const PRESTIGE_SCALE_REDUCTION = 0.2;
export const ARC_CLEAR_BONUS = 1;
export const UNLOCK_COST_DISCOUNT = 0.25;
export const DOUBLE_PRESTIGE_CHANCE = 0.2;

/** Shared by every chance-based effect so `base * level` can never exceed certainty. */
export function scaledChance(base: number, level: number): number {
  return Math.min(1, base * level);
}

/** Shared by every discount-style effect (cost reduction), clamped so a cost never hits zero. */
export function scaledDiscount(base: number, level: number): number {
  return Math.min(MAX_DISCOUNT, base * level);
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

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
        description: `Un clic automatique toutes les ${AUTOCLICK_INTERVAL_MS / 1000}s, à ${pct(AUTOCLICK_POWER_FRACTION)} de la puissance de clic`,
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
    id: "resource",
    label: "Ressource",
    nodes: [
      {
        position: 1,
        label: "Sens du commerce",
        description: `+${pct(CURRENCY_GAIN_PERCENT)} de monnaie gagnée par kill`,
      },
      {
        position: 2,
        label: "Ambition",
        description: "Réduit un peu plus le palier de monnaie nécessaire pour gagner un point de prestige",
      },
      {
        position: 3,
        label: "Butin de victoire",
        description: `+${ARC_CLEAR_BONUS} point de prestige à chaque premier arc nettoyé`,
      },
      {
        position: 4,
        label: "Négociation",
        description: `-${pct(UNLOCK_COST_DISCOUNT)} sur le coût de déblocage anticipé d'un anime`,
      },
      {
        position: 5,
        label: "Faveur du destin",
        description: `+${pct(DOUBLE_PRESTIGE_CHANCE)} de chance de doubler les points de prestige gagnés à la réinitialisation`,
      },
    ],
  },
];

/** A branch's 5 node levels (0..5 each), one entry per position — the shape persisted per branch. */
export function nodeLevels(ranks: Record<string, number[]>, categoryId: string): number[] {
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
      id: "prestige-tree:narratorClick:1",
      sourceId: "prestige-tree:narratorClick:1",
      target: "clickPower",
      kind: "percent",
      value: NARRATOR_CLICK_PERCENT * narratorLevel,
    });
  }
  const teamDpsLevel = nodeLevel(nodeLevels(ranks, "teamDps"), 1);
  if (teamDpsLevel > 0) {
    mods.push({
      id: "prestige-tree:teamDps:1",
      sourceId: "prestige-tree:teamDps:1",
      target: "teamDps",
      kind: "percent",
      value: TEAM_DPS_PERCENT * teamDpsLevel,
    });
  }
  return mods;
}
