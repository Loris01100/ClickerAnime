import type { Arc, BossTrait, Character, Enemy, Rarity, SynergyConfig } from "./types";

/**
 * Cristaux de crossover — the one resource that only exists because the game is inter-anime.
 * They drop only while the team spans two worlds, and they buy a window where the synergy malus
 * (see synergy.ts, the "characters weaken outside their world" rule) is lifted entirely.
 */
export const CROSSOVER_MOB_CHANCE = 0.02;
export const CROSSOVER_BOSS_REWARD = 5;
export const CROSSOVER_COST = 12;
export const CROSSOVER_DURATION_MS = 60_000;

/** No crystals from a mono-world team: mixing is the thing being rewarded. */
export function isMixedTeam(characters: Character[]): boolean {
  return new Set(characters.map((c) => c.animeId)).size > 1;
}

/**
 * While a crossover is up everyone fights at full power wherever they stand. Damage only — a
 * passive is still a story ability and stays shut off outside its own anime (see
 * `characterContributions`).
 */
export function crossoverSynergyConfig(config: SynergyConfig): SynergyConfig {
  return {
    ...config,
    sameAnimeMalus: config.matchingArcMultiplier,
    otherAnimeMalus: config.matchingArcMultiplier,
  };
}

/*
 * Portails de crossover — the second, and by far the larger, thing crystals buy.
 *
 * A boss never hands out its character any more (`Enemy.portalCharacterId` rather than
 * `characterId`): beating it clears its arc and drops its unique, and that is all. The character is
 * recruited by paying crystals to re-open the fight as a *portal*, once the arc is cleared, and
 * felling the boss a second time. That is what makes the crystal a currency of collection rather
 * than a one-minute buff, and it is why the resource's own rule — crystals only drop for a team
 * spanning two worlds — is load-bearing: a first world is played through without a single boss
 * recruit, and the portals are the reason to come back to it once the team is mixed.
 */

/** What one portal fight is sized at: a minute of the dps the team has **when it is opened**. */
export const PORTAL_SECONDS = 30;

/**
 * The team fights a portal boss at half strength. The hp is a minute of raw dps, so the seal makes
 * that a two-minute fight for a team that only stands there — and roughly the minute again for one
 * that actually plays it, since the Clic du Narrateur is untouched by it. That is the whole
 * difficulty of a portal: it is the one fight in the game that refuses to be idled through.
 */
export const PORTAL_DPS_RESISTANCE = 0.5;

export const PORTAL_TRAIT: BossTrait = {
  kind: "dps-resistance",
  name: "Sceau du portail",
  description: "Le boss n’encaisse que 50 % du DPS de l’équipe : seul le Clic du Narrateur passe entier.",
  multiplier: PORTAL_DPS_RESISTANCE,
};

/**
 * How much heavier or lighter than its world's usual a boss's own portal is. Derived from the data
 * already authored — a boss's hp against the mobs it is farmed among — so no world has to author a
 * portal number, and a boss that was a wall in its arc stays one here. Clamped, because the ratio
 * is a *writing* artefact as much as a design one and a single outlier must not turn a one-minute
 * fight into a ten-minute one.
 */
export const PORTAL_WEIGHT_MIN = 0.7;
export const PORTAL_WEIGHT_MAX = 1.6;

/** Crystals to open one portal. A `main` is the run's real crystal sink; a `secondary` is a detour. */
export const PORTAL_COST: Record<Rarity, number> = { main: 15, secondary: 8 };

/** How heavy a boss is against the mobs of its own arc — an arc-scale-free reading of "a wall". */
function bossPressure(arc: Arc): number {
  const mobs = arc.mobs;
  if (mobs.length === 0) return 1;
  const meanMobHp = mobs.reduce((sum, mob) => sum + mob.baseHp, 0) / mobs.length;
  return meanMobHp > 0 ? arc.boss.baseHp / meanMobHp : 1;
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * One weight per arc id, normalised **inside its own world** and clamped. A world's absolute hp
 * ramp cancels out of the ratio, so this says only what it means to say: which of a world's bosses
 * hit harder than that world's usual. Static — built once from the data, like `arcPowerTable`.
 */
export function portalWeights(arcs: readonly Arc[]): Record<string, number> {
  const byWorld = new Map<string, Arc[]>();
  for (const arc of arcs) byWorld.set(arc.animeId, [...(byWorld.get(arc.animeId) ?? []), arc]);
  const weights: Record<string, number> = {};
  for (const worldArcs of byWorld.values()) {
    const reference = median(worldArcs.map(bossPressure));
    for (const arc of worldArcs) {
      const ratio = reference > 0 ? bossPressure(arc) / reference : 1;
      weights[arc.id] = Math.min(PORTAL_WEIGHT_MAX, Math.max(PORTAL_WEIGHT_MIN, ratio));
    }
  }
  return weights;
}

/**
 * The hp a portal is frozen at the moment it is opened — deliberately a photograph of the team, not
 * a live number. Frozen, a portal left for later is the reward for having grown since; live, it
 * would run away from the player exactly as fast as they climbed.
 */
export function portalFightHp(teamDps: number, weight: number): number {
  return Math.max(1, teamDps * PORTAL_SECONDS * weight);
}

/**
 * The boss as it is met in its portal: the same enemy, sealed, with no clock and no payout. A
 * portal pays in the recruit alone — no currency, no xp, no drop, no crystals — which is what keeps
 * it out of the economy entirely: it can be won exactly once per character per run, so there is
 * nothing here to farm.
 */
export function portalEnemy(boss: Enemy): Enemy {
  return {
    id: `${boss.id}-portal`,
    name: boss.name,
    baseHp: boss.baseHp,
    reward: 0,
    bossTrait: PORTAL_TRAIT,
  };
}

/** Every boss that keeps a character behind a portal, indexed by the character it recruits. */
export function portalIndexOf(arcs: readonly Arc[]): Map<string, Arc> {
  const index = new Map<string, Arc>();
  for (const arc of arcs) {
    const characterId = arc.boss.portalCharacterId;
    if (characterId && !index.has(characterId)) index.set(characterId, arc);
  }
  return index;
}
