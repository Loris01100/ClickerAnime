import { gameData } from "../data";
import { defaultSimOptions, simulateRun, type ArcReport, type SimOptions, type SimReport } from "./sim";

// The project has no `@types/node` and doesn't need one for a single CLI: this is the whole of the
// Node surface used here. Declaring it beats adding a dependency `npm run build` would then carry.
declare const process: { argv: string[]; exit(code?: number): never };

/**
 * `npm run sim` — plays a whole run headlessly and prints its pacing.
 *
 * The point is to make a balance change checkable: run it, change one constant, run it again with
 * the same `--seed`, and compare the two tables instead of guessing. Everything here is printing;
 * the simulation itself lives in `sim.ts`.
 */

function parseArgs(argv: string[]): Partial<SimOptions> & { json: boolean } {
  const options: Partial<SimOptions> & { json: boolean } = { json: false };
  for (const arg of argv) {
    const [rawKey, rawValue] = arg.replace(/^--/, "").split("=");
    const value = rawValue ?? "";
    switch (rawKey) {
      case "json":
        options.json = true;
        break;
      case "cps":
        options.clicksPerSecond = Number(value);
        break;
      case "minutes":
        options.maxMinutes = Number(value);
        break;
      case "stall":
        options.stallMinutes = Number(value);
        break;
      case "seed":
        options.seed = Number(value);
        break;
      case "world":
        options.entryAnimeId = value;
        break;
      case "no-packs":
        options.packs = false;
        break;
      case "no-abilities":
        options.abilities = false;
        break;
      case "no-equip":
        options.equip = false;
        break;
      case "no-passives":
        options.rankPassives = false;
        break;
      case "help":
        demandHelp();
        break;
      default:
        console.error(`Unknown flag: --${rawKey}`);
        demandHelp();
    }
  }
  return options;
}

function demandHelp(): never {
  console.log(`
Usage: npm run sim -- [flags]

  --minutes=N     simulated game time budget      (default ${defaultSimOptions.maxMinutes})
  --stall=N       give up on an arc after N min   (default ${defaultSimOptions.stallMinutes})
  --cps=N         clicks per second               (default ${defaultSimOptions.clicksPerSecond})
  --seed=N        rng seed, same seed = same run  (default ${defaultSimOptions.seed})
  --world=id      entry world                     (default: first entry point)
  --no-packs      never buy a pack
  --no-abilities  never fire an ability
  --no-equip      never equip a unique
  --no-passives   never rank up a passive
  --json          print the raw report instead of the table
`);
  process.exit(0);
}

const NUMBER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}G`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return NUMBER.format(value);
}

interface Column {
  header: string;
  of: (row: ArcReport) => string;
}

const COLUMNS: Column[] = [
  { header: "Monde", of: (r) => r.world },
  { header: "Arc", of: (r) => r.arc },
  { header: "x diff", of: (r) => `${r.difficulty.toFixed(1)}` },
  { header: "min", of: (r) => r.minutes.toFixed(1) },
  { header: "kills", of: (r) => compact(r.kills) },
  { header: "copies/kill", of: (r) => r.copiesPerKill.toFixed(2) },
  { header: "équipe", of: (r) => `${r.teamSize}` },
  { header: "niv moy", of: (r) => r.avgLevel.toFixed(0) },
  { header: "dps", of: (r) => compact(r.teamDps) },
  { header: "clic", of: (r) => compact(r.clickPower) },
  { header: "timeouts", of: (r) => (r.bossTimeouts > 0 ? `${r.bossTimeouts}` : "·") },
];

function table(rows: ArcReport[]): string {
  const cells = [COLUMNS.map((c) => c.header), ...rows.map((row) => COLUMNS.map((c) => c.of(row)))];
  const widths = COLUMNS.map((_, i) => Math.max(...cells.map((line) => line[i].length)));
  const render = (line: string[]) =>
    line.map((cell, i) => (i < 2 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ");
  const [header, ...body] = cells;
  const rule = widths.map((w) => "─".repeat(w)).join("──");
  return [render(header), rule, ...body.map(render)].join("\n");
}

function summary(report: SimReport): string {
  const { totals, arcs } = report;
  const lines = [
    `Arcs terminés   ${totals.arcsCleared} / ${totals.arcsTotal}  (${(totals.completion * 100).toFixed(0)} %)`,
    `Temps de jeu    ${totals.minutes.toFixed(0)} min`,
    `Équipe          ${totals.teamSize} personnages`,
    `Gagné au total  ${compact(totals.lifetimeEarned)}`,
    `Prestige banké  ${totals.prestigeGain} points`,
  ];
  if (arcs.length > 0) {
    const slowest = [...arcs].sort((a, b) => b.minutes - a.minutes)[0];
    lines.push(`Arc le plus long ${slowest.arc} — ${slowest.minutes.toFixed(1)} min`);
  }
  if (totals.stalledOn) lines.push(`\n⚠ Mur : ${totals.stalledOn} — non terminé en ${report.options.stallMinutes} min.`);
  else if (totals.outOfTime) lines.push(`\n⚠ Budget de ${report.options.maxMinutes} min épuisé avant la fin du jeu.`);
  return lines.join("\n");
}

const parsed = parseArgs(process.argv.slice(2));
const { json, ...overrides } = parsed;
const report = simulateRun(gameData, overrides);

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nseed ${report.options.seed} · ${report.options.clicksPerSecond} clics/s\n`);
  console.log(report.arcs.length > 0 ? table(report.arcs) : "Aucun arc terminé.");
  console.log(`\n${summary(report)}\n`);
}
