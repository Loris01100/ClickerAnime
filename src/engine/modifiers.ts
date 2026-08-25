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
 * The team's stat, buff by buff, character by character. A modifier carrying a `scope` only applies
 * to that character: their own base damage, and every ability buff, which boosts only the characters
 * it comes from. That is what lets every ability and combo run at once without stacking into an
 * unbounded burst — a buff can never be worth more than its owners' share of the team.
 *
 * Each scoped group is folded on its own through the usual pipeline, with the team-wide *scaling*
 * (percents and multipliers: passives, evolutions, achievements, the tree) applied to it as well;
 * `base` and the team-wide flats are folded once, on their own, so nothing flat is counted twice.
 * With no scoped buff running this is exactly `computeEffectiveStat`, since a percent over a sum of
 * flats is the same as that percent over each flat.
 */
export function computeScopedStat(
  base: number,
  target: ModifierTarget,
  modifiers: ActiveModifier[],
  now: number
): number {
  const global = modifiers.filter((m) => m.scope === undefined);
  const scaling = global.filter((m) => m.kind !== "flat");
  const byScope = new Map<string, ActiveModifier[]>();
  for (const mod of modifiers) {
    if (mod.scope === undefined) continue;
    const group = byScope.get(mod.scope);
    if (group) group.push(mod);
    else byScope.set(mod.scope, [mod]);
  }

  let total = computeEffectiveStat(base, target, global, now);
  for (const group of byScope.values()) {
    total += computeEffectiveStat(0, target, [...scaling, ...group], now);
  }
  return total;
}
