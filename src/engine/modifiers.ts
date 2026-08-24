import type { ActiveModifier, ModifierTarget } from "./types";

/**
 * Aggregates every modifier targeting `target` into a single effective value.
 * Order matters for balance: flat additions first, then percent bonuses, then multipliers.
 */
export function computeEffectiveStat(
  base: number,
  target: ModifierTarget,
  modifiers: ActiveModifier[],
  now: number
): number {
  let flatSum = 0;
  let percentSum = 0;
  let multiplierProduct = 1;

  for (const mod of modifiers) {
    if (mod.target !== target) continue;
    if (mod.expiresAt !== undefined && mod.expiresAt <= now) continue;

    if (mod.kind === "flat") flatSum += mod.value;
    else if (mod.kind === "percent") percentSum += mod.value;
    else if (mod.kind === "multiplier") multiplierProduct *= mod.value;
  }

  return (base + flatSum) * (1 + percentSum) * multiplierProduct;
}

export function pruneExpired(modifiers: ActiveModifier[], now: number): ActiveModifier[] {
  return modifiers.filter((m) => m.expiresAt === undefined || m.expiresAt > now);
}

/**
 * Abilities of the same type don't stack: activating one cuts short whatever else was already
 * boosting the same stat, rather than adding on top of it. Diminishing returns were tried as a way
 * to let them overlap (so no ability button would ever be greyed out) and rejected: firing several
 * at once still stacked into far too much damage, and a bounded-but-large burst is worse for
 * balance than a simple "one buff per stat" rule. `activateAbility` pairs this with a lock, so the
 * player is never allowed to waste an ability on a buff that would be replaced immediately.
 */
export function replaceModifiersByTarget(
  existing: ActiveModifier[],
  incoming: ActiveModifier[]
): ActiveModifier[] {
  const targets = new Set(incoming.map((m) => m.target));
  return [...existing.filter((m) => !targets.has(m.target)), ...incoming];
}
