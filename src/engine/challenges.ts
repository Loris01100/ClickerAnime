import type { ActiveModifier, ModifierTemplate } from "./types";

/**
 * Défis de run — the same game, played under a rule that takes something away.
 *
 * A challenge is not new content: it is a *constraint* laid over the content already written, which
 * is the whole point — the roster, the arcs and the balance are untouched, only what the player is
 * allowed to lean on changes. Each one is started from a reset, cleared by getting `goal` arcs down
 * while the rule holds, and pays a permanent modifier that survives every later reset.
 *
 * Two rules keep the system honest:
 *
 * - **A constraint is enforced, never merely watched.** Every rule below is a thing the engine
 *   refuses to do (no click damage, no ability, no drop, no recruit past the cap) rather than a
 *   condition checked after the fact. There is no "you broke your challenge" state to lose a run
 *   to, and nothing to detect: the run simply cannot cheat.
 * - **A challenge takes away, it never gives.** The only thing a challenge grants is its reward,
 *   once, at the end. That is what lets the goal be counted in plain cleared arcs.
 */
export interface ChallengeRules {
  /** Le Clic du Narrateur n'inflige plus rien — l'autoclic non plus. Voir `clickIsMuted`. */
  noClick?: boolean;
  /** Aucune capacité ne se débloque. */
  noAbilities?: boolean;
  /** Plus aucun objet ne tombe : ni commun (donc aucun rang de passif), ni unique. */
  noItems?: boolean;
  /** Plafond de personnages dans l'équipe — les rencontres au-delà restent sur le carreau. */
  teamCap?: number;
}

export interface ChallengeDefinition {
  id: string;
  name: string;
  /** The rule in one line — French, like `prestigeTree.ts`'s node labels, and printed as-is. */
  constraint: string;
  rules: ChallengeRules;
  /** Arcs to clear while the rule holds. Counted from the run's own `clearedArcIds`. */
  goal: number;
  /** Paid once, permanently, folded into `allModifiers` next to the achievements' contributions. */
  reward: ModifierTemplate[];
}

/**
 * Four constraints, one per thing the game leans on: the click, the abilities, the items and the
 * size of the roster. Goals are sized by how much the rule actually hurts rather than by a round
 * number — the click is a trigger and not a damage source (see `CLAUDE.md`), so losing it is the
 * mildest of the four and asks for the longest run; losing items costs passives, uniques *and* the
 * whole farming loop at once, so it asks for the shortest.
 *
 * Rewards stay in the same register as a prestige-tree node (a few percent, `percent` on one of the
 * two `ModifierTarget`s) and are deliberately not interchangeable: clearing all four is worth
 * +37% teamDps and +30% clickPower — a lot, for four full runs played handicapped.
 */
export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "defi-muet",
    name: "Le Narrateur muet",
    constraint:
      "Le Clic du Narrateur se tait dès que l'équipe compte un personnage : le temps d'en recruter " +
      "un premier, et puis plus rien — l'autoclic non plus. L'équipe se débrouille seule.",
    rules: { noClick: true },
    goal: 10,
    reward: [{ target: "clickPower", kind: "percent", value: 0.2 }],
  },
  {
    id: "defi-silence",
    name: "Le Silence des héros",
    constraint: "Aucune capacité ne se débloque. Rien à activer, jamais.",
    rules: { noAbilities: true },
    goal: 8,
    reward: [{ target: "teamDps", kind: "percent", value: 0.12 }],
  },
  {
    id: "defi-comite",
    name: "En petit comité",
    constraint: "L'équipe ne dépasse jamais 6 personnages : les rencontres suivantes restent sur le carreau.",
    rules: { teamCap: 6 },
    goal: 8,
    reward: [
      { target: "teamDps", kind: "percent", value: 0.1 },
      { target: "clickPower", kind: "percent", value: 0.1 },
    ],
  },
  {
    id: "defi-mains-nues",
    name: "À mains nues",
    constraint: "Plus aucun objet ne tombe : ni commun, donc aucun rang de passif, ni unique à équiper.",
    rules: { noItems: true },
    goal: 6,
    reward: [{ target: "teamDps", kind: "percent", value: 0.15 }],
  },
];

export function challengeById(id: string | null): ChallengeDefinition | null {
  return CHALLENGES.find((c) => c.id === id) ?? null;
}

/** No challenge running means no rule: every caller reads this rather than branching on null. */
export const NO_CHALLENGE_RULES: ChallengeRules = {};

export interface ChallengeProgress {
  cleared: number;
  goal: number;
  done: boolean;
}

/**
 * Where a run stands against its challenge. `cleared` is the run's own count of cleared arcs, which
 * is why starting a challenge resets the run: the goal would otherwise already be met by the arcs
 * of the run in progress.
 */
export function challengeProgress(challenge: ChallengeDefinition, clearedCount: number): ChallengeProgress {
  return { cleared: Math.min(clearedCount, challenge.goal), goal: challenge.goal, done: clearedCount >= challenge.goal };
}

/**
 * Whether the narrator's click must land for nothing right now.
 *
 * The rule has exactly one exception, and it is not a softening: **with no team at all, the click is
 * the only damage in the game**. An absolute version makes its own run unstartable — the first
 * encounter can't be beaten, so the first character never joins, so nothing ever deals damage again,
 * and the run sits at ∞ time-to-kill forever. The narrator sets the scene, then goes quiet. Anything
 * else that ever mutes the click has to keep this floor: a challenge takes a *source* of damage
 * away, it must never take the last one.
 */
export function clickIsMuted(rules: ChallengeRules, teamSize: number): boolean {
  return !!rules.noClick && teamSize > 0;
}

/** True while the team may still take one more member under this rule. */
export function canRecruitUnder(rules: ChallengeRules, teamSize: number): boolean {
  return rules.teamCap === undefined || teamSize < rules.teamCap;
}

/**
 * One permanent modifier per effect of every challenge cleared — same shape and same folding point
 * as `achievementContributions`, so a reward is subject to the usual pipeline and nothing else.
 */
export function challengeContributions(completedIds: string[]): ActiveModifier[] {
  return CHALLENGES.filter((c) => completedIds.includes(c.id)).flatMap((challenge) =>
    challenge.reward.map((effect, index) => ({
      sourceId: `challenge:${challenge.id}:${index}`,
      target: effect.target,
      kind: effect.kind,
      value: effect.value,
    }))
  );
}
