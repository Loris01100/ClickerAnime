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
 * How far a character's own damage can be lifted by the buffs running on them, all sources together.
 * Multiplier buffs used to pile onto the same character, and their product ran to thousands of
 * times the enemy's hp — every fight an overkill. The ceiling is deliberately near what a single
 * team-wide buff used to be worth back when only one could run: stacking now buys you *reaching* the
 * ceiling faster and on more characters, not passing it.
 */
export const SCOPED_BUFF_CAP = 50;

/**
 * What that ceiling is worth on the **first** arc, before the run has cleared anything.
 *
 * A flat 50 made every ability the same ability. Measured with `npm run sim`, the cap starts binding
 * at arc 2 and never stops: from there on a buffed character deals exactly `bare * 50` whatever the
 * buff printed, so an early ability and a late one were worth the same thing, and the whole ladder
 * of abilities the data describes was invisible. Ramping the cap gives the printed values back their
 * meaning early — under the floor it is `computeEffectiveStat` doing the work again — and lets a
 * buff grow into the full 50x as the run goes on, which is the arc-by-arc climb the design wants.
 *
 * The **ceiling stays 50**: it is what stops stacked multipliers on one character from running away
 * (see above), and raising it re-opens exactly that. The ramp only lowers the early game.
 */
export const SCOPED_BUFF_CAP_FLOOR = 12;

/**
 * The cap in force at `progress` — the share of the game's arcs this run has cleared, 0 on the first
 * arc and 1 on the last. Geometric between floor and ceiling, so each arc cleared is worth the same
 * *ratio* of buff power rather than the same slice; that matches how every other ramp in the game
 * grows and keeps the early arcs from jumping.
 */
export function scopedBuffCap(progress: number): number {
  // A NaN here would propagate through `Math.min(buffed, bare * cap)` and blank out the whole team's
  // damage, so a progress that is not a number falls back to the floor rather than poisoning the cap.
  const t = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return SCOPED_BUFF_CAP_FLOOR * Math.pow(SCOPED_BUFF_CAP / SCOPED_BUFF_CAP_FLOOR, t);
}

/**
 * The team's stat, buff by buff, character by character. A modifier carrying a `scope` only applies
 * to that character: their own base damage, and every ability buff, which boosts only the character
 * it comes from. That is what lets every ability run at once without stacking into an unbounded
 * burst — a buff can never be worth more than its owner's share of the team.
 *
 * Each scoped group is folded on its own through the usual pipeline, with the team-wide *scaling*
 * (percents and multipliers: passives, evolutions, achievements, the tree) applied to it as well;
 * `base` and the team-wide flats are folded once, on their own, so nothing flat is counted twice.
 * With no scoped buff running this is exactly `computeEffectiveStat`, since a percent over a sum of
 * flats is the same as that percent over each flat.
 *
 * `cap` is the per-character ceiling in force right now — `scopedBuffCap` of how far the run has
 * got. It defaults to the full `SCOPED_BUFF_CAP` so a caller that has no run to read (the tests, a
 * preview) still gets the endgame value; the store always passes the ramped one.
 */
export function computeScopedStat(
  base: number,
  target: ModifierTarget,
  modifiers: ActiveModifier[],
  now: number,
  cap: number = SCOPED_BUFF_CAP
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
    const buffed = computeEffectiveStat(0, target, [...scaling, ...group], now);
    const bare = computeEffectiveStat(0, target, [...scaling, ...group.filter((m) => m.expiresAt === undefined)], now);
    total += Math.min(buffed, bare * cap);
  }
  return total;
}
