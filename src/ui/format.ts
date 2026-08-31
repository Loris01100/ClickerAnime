// Short-scale ladder, one step per 1000×. It has to reach as far as the game's numbers do: a late
// run across six worlds with prestige multipliers stacked leaves lifetime totals and boss hp well
// past a sextillion, so the ladder runs through Dc (décillion, 10^33) before we give up on words.
const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** Compact number for the HUD: 942, 1.24K, 3.10M ... and 1.24e42 once words run out. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return n < 10 ? n.toFixed(n % 1 === 0 ? 0 : 1) : Math.floor(n).toString();
  const tier = Math.floor(Math.log10(n) / 3);
  // Past the last named unit the suffix stops meaning anything, and clamping to it would print a
  // silently growing "1234567.89Dc". Scientific notation stays readable at any scale instead.
  if (tier >= UNITS.length) return n.toExponential(2).replace("e+", "e");
  return (n / 1000 ** tier).toFixed(2) + UNITS[tier];
}

export function seconds(ms: number): string {
  return (ms / 1000).toFixed(ms < 10_000 ? 1 : 0) + "s";
}
