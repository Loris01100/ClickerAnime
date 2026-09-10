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
  return foldScopedStat(base, target, global, scaling, byScope.values(), now, cap);
}

/**
 * The three accumulators the fold walks a modifier list into: the flats it sums, the percents it
 * sums, and the multipliers it multiplies. Kept as a value so the team-wide half can be folded once
 * and reused, rather than re-walked for every scoped group — see `foldScaling`.
 */
interface Accumulators {
  flatSum: number;
  percentSum: number;
  multiplierProduct: number;
}

/**
 * The team-wide scaling, walked into its three accumulators once.
 *
 * `foldScopedStat` used to re-walk this list inside each group's own fold — twice per scoped group,
 * so a fifty-strong roster walked it a hundred times per read for a result that is the same every
 * time. Hoisting it is exact rather than merely cheap: the accumulators below start from these
 * values and the group's own modifiers are added on top, which is the very sequence of float
 * operations the two nested loops used to perform. Float addition is not associative, so that order
 * is the result, not an implementation detail.
 */
function foldScaling(target: ModifierTarget, scaling: ActiveModifier[], now: number): Accumulators {
  let flatSum = 0;
  let percentSum = 0;
  let multiplierProduct = 1;

  for (const mod of scaling) {
    if (mod.target !== target) continue;
    if (mod.expiresAt !== undefined && mod.expiresAt <= now) continue;
    if (mod.kind === "flat") flatSum += mod.value;
    else if (mod.kind === "percent") percentSum += mod.value;
    else if (mod.kind === "multiplier") multiplierProduct *= mod.value;
  }
  return { flatSum, percentSum, multiplierProduct };
}

/**
 * One scoped group folded on top of an already-folded team-wide half.
 *
 * `permanentOnly` drops every timed modifier from the group — the "bare" half of the mastery cap,
 * which asks what this character is worth with no buff running. It deliberately does not apply to
 * `scaling`, which is why the same `Accumulators` serve both halves: the team-wide scaling is
 * filtered by expiry like anywhere else, never by being timed.
 */
function foldGroup(
  base: number,
  target: ModifierTarget,
  scaling: Accumulators,
  group: ActiveModifier[],
  now: number,
  permanentOnly: boolean
): number {
  let { flatSum, percentSum, multiplierProduct } = scaling;

  for (const mod of group) {
    if (mod.target !== target) continue;
    if (mod.expiresAt !== undefined && (permanentOnly || mod.expiresAt <= now)) continue;
    if (mod.kind === "flat") flatSum += mod.value;
    else if (mod.kind === "percent") percentSum += mod.value;
    else if (mod.kind === "multiplier") multiplierProduct *= mod.value;
  }

  return (base + flatSum) * (1 + percentSum) * multiplierProduct;
}

/**
 * The fold `computeScopedStat` performs, over lists that have **already** been split by scope.
 *
 * Same arithmetic, same order, same result — it just doesn't re-derive the split. The store keeps
 * `global`, `scaling` and the scope groups as memos of their own (they change when the roster or a
 * buff does, not when the clock ticks), so re-filtering the whole modifier list on every read was
 * pure repetition — and `characterStatOf` pays it once per roster row.
 *
 * `groups` is anything iterable, so a `Map`'s `.values()` goes straight in and a single character's
 * group can be passed as a one-element array.
 */
export function foldScopedStat(
  base: number,
  target: ModifierTarget,
  global: ActiveModifier[],
  scaling: ActiveModifier[],
  groups: Iterable<ActiveModifier[]>,
  now: number,
  cap: number = SCOPED_BUFF_CAP
): number {
  let total = computeEffectiveStat(base, target, global, now);
  // Folded once for the whole roster: it is the same list, at the same instant, for every group.
  const scalingFold = foldScaling(target, scaling, now);
  for (const group of groups) {
    const buffed = foldGroup(0, target, scalingFold, group, now, false);
    const bare = foldGroup(0, target, scalingFold, group, now, true);
    total += Math.min(buffed, bare * cap);
  }
  return total;
}
