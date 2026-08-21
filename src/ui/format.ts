const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx"];

/** Compact number for the HUD: 942, 1.24K, 3.10M ... */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return n < 10 ? n.toFixed(n % 1 === 0 ? 0 : 1) : Math.floor(n).toString();
  const tier = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1);
  return (n / 1000 ** tier).toFixed(2) + UNITS[tier];
}

export function seconds(ms: number): string {
  return (ms / 1000).toFixed(ms < 10_000 ? 1 : 0) + "s";
}
