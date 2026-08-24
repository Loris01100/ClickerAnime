import type { ActiveModifier, ModifierTarget } from "./types";

/**
 * How much of its printed strength the k-th *simultaneous temporary* buff on one stat is worth:
 * `STACK_FALLOFF ** k`, strongest first. Abilities used to be forbidden from overlapping on a stat
 * at all, which was the only thing keeping three multipliers from compounding into x50 — at the
 * price of a roster where 30 of 35 ability buttons were permanently greyed out. Diminishing returns
 * do the same job without taking anything away: the first buff is worth all of itself, a second is
 * a real but smaller bonus, and a tenth is worth nothing, so stacking caps itself.
 *
 * Only temporaries diminish. A character's stats, their passive, an equipped item and the prestige
 * tree are permanent and never compete with each other — see `isTemporary`.
 */
export const STACK_FALLOFF = 0.4;

/** Temporaries are exactly the modifiers that expire: abilities. Nothing else carries `expiresAt`. */
const isTemporary = (mod: ActiveModifier) => mod.expiresAt !== undefined;

/**
 * The magnitude a diminishing factor scales, per kind: the part of the value that is *bonus*.
 * A x3 multiplier at 40% is x1.8 (not x1.2), and a +50% at 40% is +20%.
 */
const bonusOf = (mod: ActiveModifier) => (mod.kind === "multiplier" ? mod.value - 1 : mod.value);
const withBonus = (mod: ActiveModifier, bonus: number) => (mod.kind === "multiplier" ? 1 + bonus : bonus);

/**
 * Aggregates every modifier targeting `target` into a single effective value.
 * Order matters for balance: flat additions first, then percent bonuses, then multipliers.
 * Overlapping temporary buffs on the same stat diminish — see `STACK_FALLOFF`.
 */
export function computeEffectiveStat(
  base: number,
  target: ModifierTarget,
  modifiers: ActiveModifier[],
  now: number
): number {
  const live = modifiers.filter(
    (mod) => mod.target === target && !(mod.expiresAt !== undefined && mod.expiresAt <= now)
  );

  let flatSum = 0;
  let percentSum = 0;
  let multiplierProduct = 1;

  const apply = (mod: ActiveModifier, value: number) => {
    if (mod.kind === "flat") flatSum += value;
    else if (mod.kind === "percent") percentSum += value;
    else if (mod.kind === "multiplier") multiplierProduct *= value;
  };

  for (const mod of live) {
    if (!isTemporary(mod)) apply(mod, mod.value);
  }

  // Strongest first, so the falloff always costs the player the *weaker* of two overlapping buffs
  // and firing a second ability can never be worse than not firing it. Ranked per kind: a percent
  // and a multiplier are not comparable magnitudes.
  for (const kind of ["flat", "percent", "multiplier"] as const) {
    const stack = live
      .filter((mod) => isTemporary(mod) && mod.kind === kind)
      .sort((a, b) => bonusOf(b) - bonusOf(a));
    stack.forEach((mod, index) => apply(mod, withBonus(mod, bonusOf(mod) * STACK_FALLOFF ** index)));
  }

  return (base + flatSum) * (1 + percentSum) * multiplierProduct;
}

export function pruneExpired(modifiers: ActiveModifier[], now: number): ActiveModifier[] {
  return modifiers.filter((m) => m.expiresAt === undefined || m.expiresAt > now);
}

/**
 * Abilities now stack (with diminishing returns, see `STACK_FALLOFF`), so the only thing that must
 * not pile up is *one ability with itself*: re-firing it refreshes its buff rather than doubling
 * it. Hence keying on `sourceId` — the ability's id — and not on the stat it touches, which used to
 * mean a new buff wiped every other ability's buff on that stat.
 */
export function replaceModifiersBySource(
  existing: ActiveModifier[],
  incoming: ActiveModifier[]
): ActiveModifier[] {
  const sources = new Set(incoming.map((m) => m.sourceId));
  return [...existing.filter((m) => !sources.has(m.sourceId)), ...incoming];
}
