import type { ActiveModifier, SynergyConfig } from "./types";

/**
 * Five independent ladders the prestige points feed — the limit `replaceModifiersByTarget` mentions
 * is a separate, still-open idea; this first pass sticks to the five branches as designed.
 */
export type PrestigeTreeCategoryId = "narratorClick" | "teamDps" | "xp" | "items" | "resource";

export interface PrestigeTreeNode {
  /** 1-indexed position in its branch; nodes unlock in order, one at a time */
  tier: number;
  cost: number;
  label: string;
  description: string;
}

export interface PrestigeTreeCategory {
  id: PrestigeTreeCategoryId;
  label: string;
  /** exactly 5 nodes, tier 1..5, index 0..4 */
  nodes: PrestigeTreeNode[];
}

/** Same ~1.6x growth ratio as `passiveRankCost`, for consistency with the game's other cost curve. */
const TIER_COSTS = [2, 3, 5, 8, 13];

// --- effect magnitudes: the balance knobs for each node ---

export const NARRATOR_CLICK_PERCENT = 0.08;
export const AUTOCLICK_INTERVAL_MS = 2_000;
export const AUTOCLICK_POWER_FRACTION = 0.2;
export const CRIT_CHANCE = 0.15;
export const CRIT_MULTIPLIER = 3;
export const CLICK_COOLDOWN_REDUCTION_MS = 300;
export const FREE_ABILITY_TRIGGER_CHANCE = 0.05;

export const TEAM_DPS_PERCENT = 0.08;
export const ABILITY_DAMAGE_BOOST = 0.2;
/** Narrows the gap between a malus and 1.0 by this fraction; never removes the malus entirely. */
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
export const GHOST_LOOT_CHANCE = 0.05;

export const CURRENCY_GAIN_PERCENT = 0.15;
export const PRESTIGE_SCALE_REDUCTION = 0.2;
export const ARC_CLEAR_BONUS = 1;
export const UNLOCK_COST_DISCOUNT = 0.25;
export const DOUBLE_PRESTIGE_CHANCE = 0.2;

const pct = (value: number) => `${Math.round(value * 100)}%`;

export const PRESTIGE_TREE_CATEGORIES: PrestigeTreeCategory[] = [
  {
    id: "narratorClick",
    label: "Clic du Narrateur",
    nodes: [
      {
        tier: 1,
        cost: TIER_COSTS[0],
        label: "Frappe affûtée",
        description: `+${pct(NARRATOR_CLICK_PERCENT)} de dégâts au clic`,
      },
      {
        tier: 2,
        cost: TIER_COSTS[1],
        label: "Écho du clic",
        description: `Un clic automatique toutes les ${AUTOCLICK_INTERVAL_MS / 1000}s, à ${pct(AUTOCLICK_POWER_FRACTION)} de la puissance de clic`,
      },
      {
        tier: 3,
        cost: TIER_COSTS[2],
        label: "Instinct critique",
        description: `${pct(CRIT_CHANCE)} de chance qu'un clic inflige x${CRIT_MULTIPLIER} dégâts`,
      },
      {
        tier: 4,
        cost: TIER_COSTS[3],
        label: "Cadence",
        description: `Chaque clic réduit le temps de recharge des capacités de ${CLICK_COOLDOWN_REDUCTION_MS}ms`,
      },
      {
        tier: 5,
        cost: TIER_COSTS[4],
        label: "Étincelle narrative",
        description: `${pct(FREE_ABILITY_TRIGGER_CHANCE)} de chance qu'un clic déclenche gratuitement une capacité débloquée`,
      },
    ],
  },
  {
    id: "teamDps",
    label: "DPS Équipe",
    nodes: [
      {
        tier: 1,
        cost: TIER_COSTS[0],
        label: "Force du collectif",
        description: `+${pct(TEAM_DPS_PERCENT)} de dégâts DPS équipe`,
      },
      {
        tier: 2,
        cost: TIER_COSTS[1],
        label: "Techniques affûtées",
        description: `+${pct(ABILITY_DAMAGE_BOOST)} sur les effets des capacités actives`,
      },
      {
        tier: 3,
        cost: TIER_COSTS[2],
        label: "Cohésion inter-mondes",
        description: "Adoucit les malus de synergie hors de l'arc actif",
      },
      {
        tier: 4,
        cost: TIER_COSTS[3],
        label: "Endurance",
        description: `+${pct(ABILITY_DURATION_BOOST)} de durée sur les buffs de capacités`,
      },
      {
        tier: 5,
        cost: TIER_COSTS[4],
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
        tier: 1,
        cost: TIER_COSTS[0],
        label: "Apprentissage",
        description: `+${pct(XP_GAIN_PERCENT)} d'XP gagnée par kill`,
      },
      {
        tier: 2,
        cost: TIER_COSTS[1],
        label: "Entraînement continu",
        description: `+${XP_PASSIVE_PER_SECOND} XP/s pour toute l'équipe, même hors combat`,
      },
      {
        tier: 3,
        cost: TIER_COSTS[2],
        label: "Courbe adoucie",
        description: "Réduit la pente de la courbe de niveau",
      },
      {
        tier: 4,
        cost: TIER_COSTS[3],
        label: "Rattrapage",
        description: `Un nouveau recrutement démarre avec ${RECRUIT_XP_BONUS} XP`,
      },
      {
        tier: 5,
        cost: TIER_COSTS[4],
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
        tier: 1,
        cost: TIER_COSTS[0],
        label: "Œil aiguisé",
        description: `+${pct(DROP_CHANCE_BOOST)} de taux de drop des objets communs`,
      },
      {
        tier: 2,
        cost: TIER_COSTS[1],
        label: "Artisanat",
        description: `-${pct(PASSIVE_RANK_DISCOUNT)} de copies requises pour ranker un passif`,
      },
      {
        tier: 3,
        cost: TIER_COSTS[2],
        label: "Aubaine",
        description: `${pct(DOUBLE_DROP_CHANCE)} de chance de récupérer deux exemplaires au lieu d'un`,
      },
      {
        tier: 4,
        cost: TIER_COSTS[3],
        label: "Pisteur",
        description: `Un objet commun est garanti tous les ${PITY_KILLS_THRESHOLD} kills sans drop`,
      },
      {
        tier: 5,
        cost: TIER_COSTS[4],
        label: "Fouille approfondie",
        description: `${pct(GHOST_LOOT_CHANCE)} de chance qu'un ennemi sans objet en lâche quand même un`,
      },
    ],
  },
  {
    id: "resource",
    label: "Ressource",
    nodes: [
      {
        tier: 1,
        cost: TIER_COSTS[0],
        label: "Sens du commerce",
        description: `+${pct(CURRENCY_GAIN_PERCENT)} de monnaie gagnée par kill`,
      },
      {
        tier: 2,
        cost: TIER_COSTS[1],
        label: "Ambition",
        description: "Réduit le palier de monnaie nécessaire pour gagner un point de prestige",
      },
      {
        tier: 3,
        cost: TIER_COSTS[2],
        label: "Butin de victoire",
        description: `+${ARC_CLEAR_BONUS} point de prestige à chaque premier arc nettoyé`,
      },
      {
        tier: 4,
        cost: TIER_COSTS[3],
        label: "Négociation",
        description: `-${pct(UNLOCK_COST_DISCOUNT)} sur le coût de déblocage anticipé d'un anime`,
      },
      {
        tier: 5,
        cost: TIER_COSTS[4],
        label: "Faveur du destin",
        description: `${pct(DOUBLE_PRESTIGE_CHANCE)} de chance de doubler les points de prestige gagnés à la réinitialisation`,
      },
    ],
  },
];

export function purchasedTier(ranks: Record<string, number>, categoryId: string): number {
  return ranks[categoryId] ?? 0;
}

export function isTierUnlocked(ranks: Record<string, number>, categoryId: string, tier: number): boolean {
  return purchasedTier(ranks, categoryId) >= tier;
}

export function nextNode(category: PrestigeTreeCategory, purchased: number): PrestigeTreeNode | null {
  return category.nodes[purchased] ?? null;
}

export function canPurchaseNextTier(
  prestigePoints: number,
  ranks: Record<string, number>,
  category: PrestigeTreeCategory
): boolean {
  const next = nextNode(category, purchasedTier(ranks, category.id));
  return next !== null && prestigePoints >= next.cost;
}

export interface TreePurchaseResult {
  prestigePoints: number;
  ranks: Record<string, number>;
}

/** Buys the next tier of a branch, in order — a branch can never skip ahead. */
export function purchaseNextTier(
  prestigePoints: number,
  ranks: Record<string, number>,
  category: PrestigeTreeCategory
): TreePurchaseResult | null {
  if (!canPurchaseNextTier(prestigePoints, ranks, category)) return null;
  const purchased = purchasedTier(ranks, category.id);
  const next = nextNode(category, purchased)!;
  return {
    prestigePoints: prestigePoints - next.cost,
    ranks: { ...ranks, [category.id]: purchased + 1 },
  };
}

/** Narrows a synergy config's malus toward 1.0 once teamDps tier 3 is bought; never removes it. */
export function softenedSynergyConfig(config: SynergyConfig, unlocked: boolean): SynergyConfig {
  if (!unlocked) return config;
  return {
    matchingArcMultiplier: config.matchingArcMultiplier,
    sameAnimeMalus: config.sameAnimeMalus + (1 - config.sameAnimeMalus) * SYNERGY_MALUS_SOFTEN,
    otherAnimeMalus: config.otherAnimeMalus + (1 - config.otherAnimeMalus) * SYNERGY_MALUS_SOFTEN,
  };
}

/** Permanent, run-independent modifiers from the branches whose effect is a flat stat percent. */
export function prestigeTreeContributions(ranks: Record<string, number>): ActiveModifier[] {
  const mods: ActiveModifier[] = [];
  if (isTierUnlocked(ranks, "narratorClick", 1)) {
    mods.push({
      id: "prestige-tree:narratorClick:1",
      sourceId: "prestige-tree:narratorClick:1",
      target: "clickPower",
      kind: "percent",
      value: NARRATOR_CLICK_PERCENT,
    });
  }
  if (isTierUnlocked(ranks, "teamDps", 1)) {
    mods.push({
      id: "prestige-tree:teamDps:1",
      sourceId: "prestige-tree:teamDps:1",
      target: "teamDps",
      kind: "percent",
      value: TEAM_DPS_PERCENT,
    });
  }
  return mods;
}
